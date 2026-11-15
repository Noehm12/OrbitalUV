"""
---------------
OrbitalUV
---------------
Starts the website on this computer.

    python app.py            opens http://localhost:8000 (or the next free port)
    python app.py 8080       try another port first

The site is plain HTML/JS (folder web/). It needs a local server because
browsers do not let a page opened from disk load its data files.
Only the standard library is used, so nothing has to be installed.
"""

import functools
import http.server
import shutil
import sys
import threading
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
WEB_DIR = ROOT / "web"


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # always serve the current files; a cached site.json from an older
        # version would not match the new data files next to it
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, *args):
        pass   # don't print every file request


def sync_team():
    # the Team page reads web/data/team.json; config/team.json is the one you edit
    src, dst = ROOT / "config" / "team.json", WEB_DIR / "data" / "team.json"
    if src.exists() and (not dst.exists() or src.stat().st_mtime > dst.stat().st_mtime):
        shutil.copy(src, dst)


def open_server(first_port):
    handler = functools.partial(Handler, directory=str(WEB_DIR))
    for port in range(first_port, first_port + 20):
        try:
            return http.server.ThreadingHTTPServer(("127.0.0.1", port), handler)
        except OSError:
            continue   # port in use, try the next one
    raise SystemExit(f"No free port between {first_port} and {first_port + 19}")


def main():
    if not (WEB_DIR / "index.html").exists():
        raise SystemExit("web/index.html not found. Run this file from the OrbitalUV folder.")
    sync_team()
    server = open_server(int(sys.argv[1]) if len(sys.argv) > 1 else 8000)
    url = f"http://localhost:{server.server_port}"
    print(f"OrbitalUV running at {url}  (Ctrl+C to stop)")
    threading.Timer(1.0, webbrowser.open, args=[url]).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nstopped")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
