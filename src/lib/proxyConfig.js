// The TeamTalk proxy runs as part of the Vite dev server automatically.
// These routes only work in development (localhost).
// For production, you would need to deploy server.js separately and
// update these URLs to point to the deployed server.
export const PROXY_URL = 'https://galacoy.onrender.com/tt-proxy/connect';
export const DISCONNECT_URL = 'https://galacoy.onrender.com/tt-proxy/disconnect';
export const STATUS_URL = 'https://galacoy.onrender.com/tt-proxy/status';
export const UNMUTE_URL = 'https://galacoy.onrender.com/tt-proxy/unmute';
export const START_STREAM_URL = 'https://galacoy.onrender.com/tt-proxy/startStream';
export const STOP_STREAM_URL = 'https://galacoy.onrender.com/tt-proxy/stopStream';