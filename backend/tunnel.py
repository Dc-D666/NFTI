"""SSH 隧道：本地 3307 → 远程 MySQL 3306，带自动重连
用法：SSH_PASSWORD='xxx' python tunnel.py

⚠️ 安全提示：
- 不要硬编码密码！从环境变量读取或使用 SSH Key 认证
- 密码认证已被禁用，请改用 SSH Key (ssh-keygen + ssh-copy-id)
- 参考：ssh-keygen -t ed25519 && ssh-copy-id root@49.232.252.213
"""
import os, socket, select, sys, time, threading
from paramiko import SSHClient, WarningPolicy

SSH_HOST = os.environ.get("SSH_HOST", "49.232.252.213")
SSH_USER = os.environ.get("SSH_USER", "root")
SSH_PASS = os.environ.get("SSH_PASSWORD", "")
LOCAL_PORT = int(os.environ.get("LOCAL_PORT", "3307"))
REMOTE_HOST = os.environ.get("REMOTE_HOST", "127.0.0.1")
REMOTE_PORT = int(os.environ.get("REMOTE_PORT", "3306"))

# 不再从硬编码读取数据库密码，使用 backend/.env

class Tunnel:
    def __init__(self):
        self.client = None
        self.transport = None
        self.server = None
        self.sockets = []
        self.running = True
        self.lock = threading.Lock()

    def connect_ssh(self):
        if not SSH_PASS:
            print("[TUNNEL] 未设置 SSH_PASSWORD 环境变量，请改用 SSH Key 认证", flush=True)
            print("[TUNNEL] 参考: ssh-keygen -t ed25519 && ssh-copy-id root@49.232.252.213", flush=True)
            sys.exit(1)
        c = SSHClient()
        c.set_missing_host_key_policy(WarningPolicy())
        c.connect(SSH_HOST, username=SSH_USER, password=SSH_PASS, timeout=15)
        t = c.get_transport()
        t.set_keepalive(30)
        print(f"[TUNNEL] SSH connected: {SSH_USER}@{SSH_HOST}", flush=True)
        self.client = c
        self.transport = t

    def start_server(self):
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        s.bind(("127.0.0.1", LOCAL_PORT))
        s.listen(5)
        s.settimeout(2.0)
        print(f"[TUNNEL] Listening: localhost:{LOCAL_PORT}", flush=True)
        self.server = s

    def handle_client(self, conn, addr):
        try:
            chan = self.transport.open_channel("direct-tcpip", (REMOTE_HOST, REMOTE_PORT), addr)
        except Exception as e:
            print(f"[TUNNEL] open channel failed: {e}", flush=True)
            try: conn.close()
            except: pass
            return
        pair = [conn, chan]
        with self.lock:
            self.sockets.extend(pair)
        try:
            while self.running:
                r, _, _ = select.select(pair, [], [], 30.0)
                if not r:
                    if not self.transport or not self.transport.is_active():
                        break
                    continue
                for sock in r:
                    data = sock.recv(65536)
                    if not data:
                        return
                    peer = pair[1] if sock is pair[0] else pair[0]
                    peer.sendall(data)
        except:
            pass
        finally:
            with self.lock:
                for s in pair:
                    if s in self.sockets:
                        self.sockets.remove(s)
            for s in pair:
                try: s.close()
                except: pass

    def run(self):
        while self.running:
            try:
                self.connect_ssh()
                self.start_server()
                print("[TUNNEL] Tunnel established, forwarding...", flush=True)
                while self.running and self.transport and self.transport.is_active():
                    try:
                        conn, addr = self.server.accept()
                        t = threading.Thread(target=self.handle_client, args=(conn, addr), daemon=True)
                        t.start()
                    except socket.timeout:
                        continue
                    except Exception as e:
                        if self.running:
                            print(f"[TUNNEL] accept error: {e}", flush=True)
                        break
                print("[TUNNEL] SSH connection lost, reconnecting in 5s...", flush=True)
            except Exception as e:
                print(f"[TUNNEL] Connection failed: {e}, retrying in 5s...", flush=True)
            finally:
                self.cleanup()
            if self.running:
                time.sleep(5)

    def cleanup(self):
        with self.lock:
            for s in self.sockets:
                try: s.close()
                except: pass
            self.sockets.clear()
        if self.server:
            try: self.server.close()
            except: pass
            self.server = None
        if self.client:
            try: self.client.close()
            except: pass
            self.client = None
        self.transport = None

    def stop(self):
        self.running = False
        self.cleanup()

if __name__ == "__main__":
    t = Tunnel()
    try:
        t.run()
    except KeyboardInterrupt:
        t.stop()
        print("\n[TUNNEL] closed", flush=True)
