"""假的 OpenAI 兼容 / Anthropic 接口，供 e2e_llm.py 使用。
python3 mock_llm.py 8765            # 带跨域头
python3 mock_llm.py 8766 --nocors   # 不带跨域头，模拟 DeepSeek 等拦截网页直连
"""
import json, sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
CORS = '--nocors' not in sys.argv
LOG = []

def answer(text):
    if '连通测试' in text: return '收到'
    if '"progress"' in text: return json.dumps({"progress": "读到第二章，读了两遍", "stuck": "认知革命那段没想通", "rhythm": "", "promises": "读第三章"}, ensure_ascii=False)
    if '"habits"' in text: return json.dumps({"habits": "晚上做事", "returns": "", "likes": "具体的问题"}, ensure_ascii=False)
    if '"drowsy"' in text: return json.dumps({"due": "今天读第三章前十页", "drowsy": "快睡了，读十分钟第三章", "sleep": "睡了，回来从第三章开始"}, ensure_ascii=False)
    if '测红线' in text and '不符合要求' not in text: return json.dumps({"say": "好想你呀，你终于来了", "ask": "今天读了什么？", "next": "读一页"}, ensure_ascii=False)
    if '旧壳' in text: return '你读完了前五章。留下的判断是：作者的例子比结论可靠。'
    if 'milestones' in text: return '```json\n' + json.dumps({"kind": "read", "milestones": [{"name": "读完前五章", "doneWhen": "第 5 章读完"}, {"name": "读完中段", "doneWhen": "第 13 章读完"}, {"name": "读完全书", "doneWhen": "最后一章读完"}], "firstStep": "外部模型：翻开第 1 章读 10 页"}, ensure_ascii=False) + '\n```'
    if '"say"' in text: return '好的，给你：' + json.dumps({"say": "外部模型说：第二章读两遍，说明真卡住了。", "ask": "哪一句让你想通的？", "next": "读第 2 章前 10 页"}, ensure_ascii=False)
    if 'JSON 数组' in text: return '["翻开第 7 章读一页","重看划线的两段","读十分钟"]'
    return '外部模型回复：那就只读一页，读完告诉我第一句。'

class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def cors(self):
        if CORS:
            self.send_header('access-control-allow-origin', '*')
            self.send_header('access-control-allow-headers', '*')
            self.send_header('access-control-allow-methods', 'POST, OPTIONS')
    def do_GET(self):
        body = json.dumps(LOG[-50:]).encode() if self.path.startswith('/__log') else b'{}'
        self.send_response(200); self.cors(); self.send_header('content-type', 'application/json'); self.end_headers(); self.wfile.write(body)
    def do_OPTIONS(self):
        self.send_response(204); self.cors(); self.end_headers()
    def do_POST(self):
        n = int(self.headers.get('content-length') or 0); body = json.loads(self.rfile.read(n) or b'{}')
        auth = self.headers.get('authorization') or self.headers.get('x-api-key') or ''
        msgs = body.get('messages', []); text = '\n'.join(str(m.get('content', '')) for m in msgs)
        LOG.append({'path': self.path, 'model': body.get('model'), 'n': len(msgs), 'device': self.headers.get('x-yz-device') or '', 'kind': 'react' if '"say"' in text else 'chat' if '主人来找你聊' in text else 'other'})
        if 'bad' in auth:
            self.send_response(401); self.cors(); self.send_header('content-type', 'application/json'); self.end_headers()
            self.wfile.write(json.dumps({"error": {"message": "Invalid API key"}}).encode()); return
        out = answer(text)
        if self.path.endswith('/v1/messages'):
            data = {"content": [{"type": "text", "text": out}], "stop_reason": "end_turn", "usage": {}}
        else:
            data = {"choices": [{"message": {"role": "assistant", "content": out}, "finish_reason": "stop"}], "usage": {}}
        self.send_response(200); self.cors(); self.send_header('content-type', 'application/json'); self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode())

if __name__ == '__main__':
    ThreadingHTTPServer(('127.0.0.1', PORT), H).serve_forever()
