from flask import Flask, render_template, abort, redirect, request, jsonify, session
from flask_socketio import SocketIO, emit
import json
import time
import uuid

app = Flask(__name__)
app.config['SECRET_KEY'] = '適当な秘密鍵' # Use app.config for secret key
socketio = SocketIO(app, cors_allowed_origins="*") # Allow all origins for simplicity during development

active_users = {}
SESSION_TIMEOUT = 10  # 秒、最後のアクセスからこの時間で切れる

# --- Block Management ---
BLOCK_SIZE = 50
DEFAULT_COLS = 20 # Assuming a default game world width of 1000 (20 * 50)
DEFAULT_ROWS = 16 # Assuming a default game world height of 800 (16 * 50)

# Store blocks as a set of (x, y) tuples for efficient lookup
# These are world coordinates, not tile indices
world_blocks = set()

def initialize_world_blocks():
    for j in range(13, DEFAULT_ROWS):
        for i in range(DEFAULT_COLS):
            if i == 12 and j >= 15:
                continue
            # Store center coordinates of the block
            world_blocks.add((i * BLOCK_SIZE + BLOCK_SIZE / 2, j * BLOCK_SIZE + BLOCK_SIZE / 2))

initialize_world_blocks()

REQUEST_FILE = './requestapp.json'

# items にダウンロード用URLを紐付ける
items = [
    {"title": "retro_turbogame", "download": "NyanthuUtillSoft/releases/download/v1.02/1.1.1.2.html", "description": "A retro-style racing game."},
    {"title": "NyanthuGame(Mac)", "download": "NyanthuGame/releases/download/v1.01/game.zip", "description": "An exciting adventure game for macOS."},
    {"title": "NyanthuNetSoft", "download": "NyanthuNetSoft/releases/download/v1.01/netsoft.zip", "description": "A utility software for network analysis."},
    {"title": "NyanthuCoin", "download": "NyanthuCoin/releases/download/v1.01/coin.zip", "description": "A virtual currency application."}
]

# 自動で url 追加
for i, item in enumerate(items):
    item["url"] = str(i)

def load_requests():
    try:
        with open(REQUEST_FILE, 'r') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return []

def save_requests(data):
    with open(REQUEST_FILE, 'w') as f:
        json.dump(data, f, indent=4)

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/dl/<item_code>")
def dl_item(item_code):
    item = next((x for x in items if x["url"] == item_code), None)
    if not item:
        abort(404)
    item["index"] = items.index(item)
    # dl ページで詳細を見せる場合
    return render_template("dl_item.html", item_info=item)

# store ページでカード一覧表示
@app.route("/store")
def store():
    search_query = request.args.get('q', '')
    if search_query:
        filtered_cards = [
            card for card in items
            if search_query.lower() in card['title'].lower() or
               search_query.lower() in card['description'].lower()
        ]
    else:
        filtered_cards = items
    return render_template("store.html", cards=filtered_cards, search_query=search_query)

# install で items に紐付けた GitHub URL にリダイレクト
@app.route("/install/<item_code>")
def install(item_code):
    item = next((x for x in items if x["url"] == item_code), None)
    if not item:
        abort(404)

    # フルURLに飛ばす
    github_url = f"https://github.com/nyanthu-okabe/{item['download']}"
    return redirect(github_url)

@app.route("/requestapp", methods=['GET', 'POST'])
def request_app():
    app_requests = load_requests()
    if request.method == 'POST':
        app_name = request.form.get('app_name')
        app_description = request.form.get('app_description')
        if app_name and app_description:
            app_requests.append({'name': app_name, 'description': app_description})
            save_requests(app_requests)
            return redirect('/requestapp')

    return render_template("request.html", requests=app_requests)

@app.route("/demo")
def demo():
    return render_template("demo.html")

@socketio.on('connect')
def handle_connect():
    user_id = session.get('user_id')
    if not user_id:
        session['user_id'] = str(uuid.uuid4())
        user_id = session['user_id']
    
    active_users[user_id] = {'last_seen': time.time(), 'sid': request.sid}
    print(f"Client connected: {user_id} (SID: {request.sid})")
    emit('current_users', get_active_users_data(), broadcast=True)
    emit('initial_blocks', list(world_blocks)) # Send initial blocks to the newly connected client

@socketio.on('disconnect')
def handle_disconnect():
    user_id_to_remove = None
    for uid, info in active_users.items():
        if info.get('sid') == request.sid:
            user_id_to_remove = uid
            break
    
    if user_id_to_remove:
        del active_users[user_id_to_remove]
        print(f"Client disconnected: {user_id_to_remove} (SID: {request.sid})")
        emit('user_disconnected', {'id': user_id_to_remove}, broadcast=True)
        emit('current_users', get_active_users_data(), broadcast=True) # Update all clients

@socketio.on('update_position')
def handle_update_position(data):
    user_id = session.get('user_id')
    if not user_id:
        return

    x = data.get('x')
    y = data.get('y')

    if x is None or y is None:
        return

    active_users[user_id]['x'] = x
    active_users[user_id]['y'] = y
    active_users[user_id]['last_seen'] = time.time()
    
    # Broadcast the updated position to all other clients
    emit('user_position_update', {'id': user_id, 'x': x, 'y': y}, broadcast=True, include_self=False)

@socketio.on('create_block')
def handle_create_block(data):
    x = data.get('x')
    y = data.get('y')
    if x is not None and y is not None:
        block_coords = (x, y)
        if block_coords not in world_blocks:
            world_blocks.add(block_coords)
            emit('block_created', {'x': x, 'y': y}, broadcast=True)

@socketio.on('delete_block')
def handle_delete_block(data):
    x = data.get('x')
    y = data.get('y')
    if x is not None and y is not None:
        block_coords = (x, y)
        if block_coords in world_blocks:
            world_blocks.remove(block_coords)
            emit('block_deleted', {'x': x, 'y': y}, broadcast=True)

def get_active_users_data():
    now = time.time()
    # Clean up old users (though disconnect should handle most)
    users_to_remove = []
    for uid, info in active_users.items():
        if 'last_seen' not in info or now - info['last_seen'] > SESSION_TIMEOUT:
            users_to_remove.append(uid)
    for uid in users_to_remove:
        if uid in active_users: # Check again in case it was removed by disconnect
            del active_users[uid]

    # Return users with x, y coordinates
    users_data = [
        {"id": uid, "x": info["x"], "y": info["y"]}
        for uid, info in active_users.items()
        if "x" in info and "y" in info
    ]
    return users_data

if __name__ == "__main__":
    socketio.run(app, debug=True)
