from flask import Flask, render_template, abort, redirect

app = Flask(__name__)

# items にダウンロード用URLを紐付ける
items = [
    {"title": "retro_turbogame", "download": "NyanthuUtillSoft/releases/download/v1.02/1.1.1.2.html"},
    {"title": "NyanthuGame(Mac)", "download": "NyanthuGame/releases/download/v1.01/game.zip"},
    {"title": "NyanthuNetSoft", "download": "NyanthuNetSoft/releases/download/v1.01/netsoft.zip"},
    {"title": "NyanthuCoin", "download": "NyanthuCoin/releases/download/v1.01/coin.zip"}
]

# 自動で url 追加
for i, item in enumerate(items):
    item["url"] = str(i)

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/dl")
def dl_list():
    return render_template("dl.html", cards=items)

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
    return render_template("store.html", cards=items)

# install で items に紐付けた GitHub URL にリダイレクト
@app.route("/install/<item_code>")
def install(item_code):
    item = next((x for x in items if x["url"] == item_code), None)
    if not item:
        abort(404)

    # フルURLに飛ばす
    github_url = f"https://github.com/nyanthu-okabe/{item['download']}"
    return redirect(github_url)

if __name__ == "__main__":
    app.run(debug=True)
