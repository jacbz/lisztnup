// Component re-exports
// Note: Import directly from .svelte files in your components
// These re-exports are for convenience but may have TypeScript issues

// Primitives - Basic reusable UI elements
export { default as Toast } from './primitives/Toast.svelte';
export { default as Popup } from './primitives/Popup.svelte';
export { default as Dialog } from './primitives/Dialog.svelte';
export { default as EdgeDisplay } from './primitives/EdgeDisplay.svelte';
export { default as NumberSelector } from './primitives/NumberSelector.svelte';
export { default as ToggleButton } from './primitives/ToggleButton.svelte';
export { default as Slider } from './primitives/Slider.svelte';
export { default as RangeSlider } from './primitives/RangeSlider.svelte';
export { default as ExternalLink } from './primitives/ExternalLink.svelte';
export { default as QRCode } from './primitives/QRCode.svelte';
export { default as Logo } from './primitives/Logo.svelte';

// Setup - Game/player setup components
export { default as ModeSelector } from './setup/ModeSelector.svelte';
export { default as ModeRulesPopup } from './setup/ModeRulesPopup.svelte';
export { default as PlayerSetup } from './setup/PlayerSetup.svelte';
export { default as TracklistSelector } from './setup/TracklistSelector.svelte';
export { default as TracklistEditor } from './setup/TracklistEditor.svelte';
export { default as TracklistViewer } from './setup/TracklistViewer.svelte';
export { default as BingoSetup } from './setup/BingoSetup.svelte';
export { default as ShareLinkPopup } from './setup/ShareLinkPopup.svelte';

// Gameplay - In-game components
export { default as InGameSettings } from './gameplay/InGameSettings.svelte';
export { default as PlayerControl } from './gameplay/PlayerControl.svelte';
export { default as TrackInfo } from './gameplay/TrackInfo.svelte';

// Screens - Full screen components
export { default as HomeScreen } from './screens/HomeScreen.svelte';
export { default as LoadingScreen } from './screens/LoadingScreen.svelte';
export { default as ScoringScreen } from './screens/ScoringScreen.svelte';
export { default as StatsScreen } from './screens/StatsScreen.svelte';
export { default as EndGameScreen } from './screens/EndGameScreen.svelte';
