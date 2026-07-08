// Stand-in for the `server-only` package in the WORKER build only.
//
// `server-only` exists to fail the WEB build if server code (API keys!) ever
// gets pulled toward a client bundle. The worker has no client side — every
// line of it is server code — so the guard is meaningless there, and without
// this shim the package throws at import time unless Node runs with
// `--conditions=react-server`. Aliasing it to this empty module keeps the
// worker start command flag-free. The Next.js build keeps the real package
// and its protection, untouched.
export {};
