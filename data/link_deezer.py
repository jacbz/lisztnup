import psycopg2
import io
import time
import sys
import os

# --- Configuration ---
DB_CONFIG = {
    "host": "localhost",
    "database": "musicbrainz_db",
    "user": "musicbrainz",
    "password": "musicbrainz"
}

# --- File and Table Paths ---
SQL_FILE_PATH = 'deezer_track.sql'
PROGRESS_FILE = 'load_progress.txt'
ERROR_LOG_FILE = 'error_log.txt'

# --- Target Schema and Table Names ---
TARGET_SCHEMA = 'musicbrainz'
TARGET_TABLE = 'deezer'
QUALIFIED_TABLE_NAME = f'{TARGET_SCHEMA}.{TARGET_TABLE}'
TEMP_TABLE_NAME = f'{TARGET_TABLE}_temp_load'
QUALIFIED_TEMP_TABLE_NAME = f'{TARGET_SCHEMA}.{TEMP_TABLE_NAME}'

# --- Performance Tuning ---
BATCH_SIZE = 250000
PROGRESS_INTERVAL = 100000

# --- Robust Parser ---
def parse_pg_dump_values(data_string):
    fields = []
    in_quotes = False
    current_field = []
    i = 0
    while i < len(data_string):
        char = data_string[i]
        if char == "'":
            if i + 1 < len(data_string) and data_string[i+1] == "'":
                current_field.append("''")
                i += 1
            else:
                in_quotes = not in_quotes
                current_field.append("'")
        elif char == ',' and not in_quotes:
            fields.append("".join(current_field).strip())
            current_field = []
        else:
            current_field.append(char)
        i += 1
    fields.append("".join(current_field).strip())
    return fields

# --- Script ---

def get_db_connection():
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        return conn
    except psycopg2.OperationalError as e:
        print(f"FATAL: Could not connect to the database: {e}", file=sys.stderr)
        sys.exit(1)

def setup_database(conn):
    with conn.cursor() as cur:
        print("Setting up database schema and tables...")
        cur.execute(f"CREATE SCHEMA IF NOT EXISTS {TARGET_SCHEMA};")
        cur.execute(f"""
            CREATE TABLE IF NOT EXISTS {QUALIFIED_TABLE_NAME} (
                isrc TEXT PRIMARY KEY,
                track_id BIGINT NOT NULL
            );
        """)
        cur.execute(f"DROP TABLE IF EXISTS {QUALIFIED_TEMP_TABLE_NAME};")
        cur.execute(f"""
            CREATE UNLOGGED TABLE {QUALIFIED_TEMP_TABLE_NAME} (
                isrc TEXT,
                track_id BIGINT
            );
        """)
        conn.commit()
        print("Database setup complete.")

def read_progress():
    if not os.path.exists(PROGRESS_FILE):
        return 0
    try:
        with open(PROGRESS_FILE, 'r') as f:
            content = f.read().strip()
            return int(content) if content else 0
    except (IOError, ValueError):
        return 0

def save_progress(line_num):
    with open(PROGRESS_FILE, 'w') as f:
        f.write(str(line_num))

def flush_buffer_to_db(conn, buffer, rows_in_buffer):
    if rows_in_buffer == 0:
        return 0
    inserted_count = 0
    with conn.cursor() as cur:
        buffer.seek(0)
        cur.copy_expert(
            f"COPY {QUALIFIED_TEMP_TABLE_NAME}(isrc, track_id) FROM STDIN",
            buffer
        )
        cur.execute(f"""
            INSERT INTO {QUALIFIED_TABLE_NAME} (isrc, track_id)
            SELECT isrc, track_id FROM {QUALIFIED_TEMP_TABLE_NAME}
            ON CONFLICT (isrc) DO NOTHING;
        """)
        inserted_count = cur.rowcount
        cur.execute(f"TRUNCATE TABLE {QUALIFIED_TEMP_TABLE_NAME};")
        conn.commit()
    return inserted_count

def process_sql_dump(conn):
    start_line = read_progress()
    print("-" * 50)
    if start_line > 0:
        print(f"Resuming process from line {start_line + 1:,}.")
    else:
        print(f"Starting new process from the beginning.")
    print(f"Errors will be logged to '{ERROR_LOG_FILE}'.")
    print("-" * 50)

    start_time = time.time()
    total_rows_inserted = 0
    lines_processed_session = 0
    buffer = io.StringIO()
    rows_in_buffer = 0

    try:
        with open(SQL_FILE_PATH, 'r', encoding='latin-1', errors='ignore') as f_in, \
             open(ERROR_LOG_FILE, 'a') as f_err:
            if start_line > 0:
                print("Fast-forwarding to resume point...")
                for _ in range(start_line):
                    next(f_in)
                print("Resumed.")
            
            for line_num, line in enumerate(f_in, start=start_line + 1):
                if not line.startswith('INSERT INTO public.deezer_track VALUES'):
                    continue

                try:
                    data_part = line[line.find('(') + 1 : line.rfind(')')]
                    values = parse_pg_dump_values(data_part)
                    
                    if len(values) < 6:
                        raise ValueError(f"Line has only {len(values)} fields after parsing.")

                    track_id = values[0]
                    isrc_raw = values[5]
                    isrc = isrc_raw.strip("'")
                    
                    if isrc:
                        buffer.write(f"{isrc}\t{track_id}\n")
                        rows_in_buffer += 1
                    else:
                        raise ValueError("ISRC is an empty string.")

                except (IndexError, ValueError) as e:
                    f_err.write(f"Line {line_num}: {e} - {line.strip()}\n")
                    continue

                if rows_in_buffer >= BATCH_SIZE:
                    inserted = flush_buffer_to_db(conn, buffer, rows_in_buffer)
                    total_rows_inserted += inserted
                    save_progress(line_num)
                    buffer.close()
                    buffer = io.StringIO()
                    rows_in_buffer = 0

                lines_processed_session += 1
                if lines_processed_session % PROGRESS_INTERVAL == 0:
                    elapsed = time.time() - start_time
                    rate = lines_processed_session / elapsed if elapsed > 0 else 0
                    print(
                        f"At line {line_num:,} | "
                        f"Rows inserted this session: {total_rows_inserted:,} | "
                        f"Rate: {rate:,.0f} lines/sec",
                        end='\r'
                    )

            if rows_in_buffer > 0:
                print("\nFlushing final batch...")
                inserted = flush_buffer_to_db(conn, buffer, rows_in_buffer)
                total_rows_inserted += inserted
                save_progress(line_num)

    finally:
        buffer.close()

    end_time = time.time()
    print("\n" + "=" * 50)
    print("Processing complete.")
    print(f"Total new rows inserted in this session: {total_rows_inserted:,}")
    print(f"Total time taken this session: {end_time - start_time:.2f} seconds.")
    print("=" * 50)

if __name__ == '__main__':
    conn = None
    try:
        conn = get_db_connection()
        setup_database(conn)
        process_sql_dump(conn)
    except KeyboardInterrupt:
        print("\n\nProcess interrupted by user. Progress has been saved. Exiting gracefully.")
        sys.exit(0)
    except Exception as e:
        print(f"\nAn unexpected error occurred: {e}", file=sys.stderr)
        sys.exit(1)
    finally:
        if conn:
            conn.close()
            print("Database connection closed.")