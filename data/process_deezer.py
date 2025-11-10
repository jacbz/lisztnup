import json
import os
from pathlib import Path
import asyncio
import aiohttp
from tqdm.asyncio import tqdm


async def fetch_deezer(semaphore: asyncio.Semaphore, deezer_id: int) -> tuple[int, dict]:
    """
    Fetch Deezer track info asynchronously with concurrency limit.

    Returns (deezer_id, response_dict).
    """
    async with semaphore:
        async with aiohttp.ClientSession() as session:
            try:
                async with session.get(f"https://api.deezer.com/track/{deezer_id}") as resp:
                    res = await resp.json()
                    # Check for quota or service busy
                    error = res.get("error")
                    if error and error.get("code") in [4, 700]:
                        print(f"Rate limit hit for {deezer_id}, sleeping 5 seconds...")
                        await asyncio.sleep(5)
                    await asyncio.sleep(1)  # Throttle: 1 second after each API call
                    return deezer_id, res
            except Exception as e:
                await asyncio.sleep(1)  # Throttle even on exception
                return deezer_id, {"error": {"type": "Exception", "message": str(e), "code": 0}}


def load_excluded() -> set[int]:
    """Load excluded Deezer IDs from file, create empty file if not exists."""
    path = Path("excluded_deezer_ids")
    if path.exists():
        return set(int(line.strip()) for line in path.read_text().splitlines() if line.strip())
    else:
        path.write_text("")
        return set()


def load_processed() -> set[int]:
    """Load processed Deezer IDs from file, create empty file if not exists."""
    path = Path("processed_deezer_ids")
    if path.exists():
        return set(int(line.strip()) for line in path.read_text().splitlines() if line.strip())
    else:
        path.write_text("")
        return set()


def save_processed(processed: set[int]) -> None:
    """Save processed Deezer IDs to file."""
    Path("processed_deezer_ids").write_text("\n".join(map(str, sorted(processed))) + "\n")


async def main() -> None:
    """
    Main function to check Deezer IDs for validity.
    """
    # Toggle: Set to True to recheck previously excluded IDs and remove them if they now have previews
    recheck_excluded = False
    
    # Load data
    excluded = load_excluded()
    processed = load_processed()
    print(f"Loaded {len(excluded)} excluded and {len(processed)} processed Deezer IDs.")

    # Load JSON data
    json_path = Path("../static/lisztnup.json")
    with json_path.open("r", encoding="utf-8") as f:
        data = json.load(f)

    # Collect all Deezer IDs to check
    ids_to_check = set()
    
    if recheck_excluded:
        # Recheck mode: check all previously excluded IDs
        ids_to_check = excluded.copy()
        print(f"Recheck mode: will verify {len(ids_to_check)} previously excluded IDs.")
    else:
        # Normal mode: check IDs not excluded or processed
        for works in data["works"].values():
            for work in works:
                for part in work["parts"]:
                    for deezer_id in part["deezer"]:
                        if deezer_id not in excluded and deezer_id not in processed:
                            ids_to_check.add(deezer_id)

    ids_list = list(ids_to_check)
    print(f"Found {len(ids_list)} Deezer IDs to check.")

    if not ids_list:
        print("No IDs to check. Exiting.")
        return

    semaphore = asyncio.Semaphore(10)  # Limit to 10 concurrent requests
    new_excluded = 0
    removed_from_excluded = 0  # Track IDs removed from excluded list in recheck mode
    retry_ids = set()

    # Create tasks
    tasks = [fetch_deezer(semaphore, did) for did in ids_list]

    with tqdm(total=len(ids_list), desc="Checking IDs") as pbar:
        for coro in asyncio.as_completed(tasks):
            deezer_id, res = await coro
            processed.add(deezer_id)
            error = res.get("error")
            
            if recheck_excluded:
                # Recheck mode: remove from excluded if preview is now available
                if not error and res.get("preview"):
                    excluded.discard(deezer_id)
                    removed_from_excluded += 1
                    Path("excluded_deezer_ids").write_text("\n".join(map(str, sorted(excluded))) + "\n")
                    print(f"Removed {deezer_id} from excluded (preview now available)")
                # If still no preview or error, keep it in excluded (do nothing)
            else:
                # Normal mode: add to excluded if no preview or error
                if error:
                    error_type = error.get("type")
                    error_code = error.get("code", 0)
                    if error_type == "DataException":
                        # Treat as failure
                        excluded.add(deezer_id)
                        Path("excluded_deezer_ids").open("a").write(f"{deezer_id}\n")
                        new_excluded += 1
                        print(f"Excluded {deezer_id} (DataException)")
                    else:
                        retry_ids.add(deezer_id)
                        print(f"Retrying later: {deezer_id} (code {error_code})")
                elif not res.get("preview"):
                    # No preview, exclude
                    excluded.add(deezer_id)
                    Path("excluded_deezer_ids").open("a").write(f"{deezer_id}\n")
                    new_excluded += 1
                    print(f"Excluded {deezer_id} (no preview)")

            pbar.update(1)
            if len(processed) % 100 == 0:
                save_processed(processed)

    # Save progress
    save_processed(processed)
    
    if recheck_excluded:
        print(f"Recheck complete. Removed {removed_from_excluded} IDs from excluded list. Total excluded: {len(excluded)}")
    else:
        # Normal mode
        print(f"Progress saved. Newly excluded: {new_excluded}, Total excluded: {len(excluded)}")

    # Handle retries
    if retry_ids:
        print(f"Retrying {len(retry_ids)} IDs...")
        # Add back to ids_list and process once more
        retry_list = list(retry_ids - processed)  # Avoid duplicates
        if retry_list:
            retry_tasks = [fetch_deezer(semaphore, did) for did in retry_list]
            for coro in asyncio.as_completed(retry_tasks):
                deezer_id, res = await coro
                processed.add(deezer_id)
                error = res.get("error")
                if error:
                    error_type = error.get("type")
                    if error_type == "DataException":
                        excluded.add(deezer_id)
                        Path("excluded_deezer_ids").open("a").write(f"{deezer_id}\n")
                        new_excluded += 1
                        print(f"Excluded {deezer_id} (DataException on retry)")
                    else:
                        # Still error, exclude
                        excluded.add(deezer_id)
                        Path("excluded_deezer_ids").open("a").write(f"{deezer_id}\n")
                        new_excluded += 1
                        print(f"Excluded {deezer_id} (error on retry: {error_type})")
                elif not res.get("preview"):
                    excluded.add(deezer_id)
                    Path("excluded_deezer_ids").open("a").write(f"{deezer_id}\n")
                    new_excluded += 1
                    print(f"Excluded {deezer_id} (no preview on retry)")
            if len(processed) % 100 == 0:
                save_processed(processed)
            save_processed(processed)
            print(f"Retry complete. Total newly excluded: {new_excluded}")

    print("Done.")


if __name__ == "__main__":
    asyncio.run(main())