from flask import Flask, render_template, abort, redirect, request
import json

app = Flask(__name__)

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

if __name__ == "__main__":
    app.run(debug=True)
