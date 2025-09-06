import { Block } from "./block.js";

export class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: "GameScene" });
    this.playerWorldX = 0; // Player's actual world X coordinate
    this.playerWorldY = 0; // Player's actual world Y coordinate
    this.speed_x = 0;
    this.speed_y = 0;
    this.now_users = [];
    this.userBlocks = {}; // uid -> Block インスタンス
    this.lastSentPosition = { x: null, y: null };
    this.worldBlocks = new Set(); // Store blocks received from the server as (x, y) tuples
    this.renderedBlocks = {}; // Store Phaser Block objects, key: `x,y`
  }

  preload() {}

  create() {
    const BLOCK_SIZE = 50;
    const cols = Math.ceil(this.scale.width / BLOCK_SIZE);
    const rows = Math.ceil(this.scale.height / BLOCK_SIZE);

    // プレイヤーを画面中央に配置
    this.player = new Block(
      this,
      Math.floor(cols / 2) * BLOCK_SIZE + BLOCK_SIZE / 2,
      Math.floor(rows / 2) * BLOCK_SIZE + BLOCK_SIZE / 2,
      0xffaa00,
    );

    this.cursors = this.input.keyboard.createCursorKeys();

    // 衝突判定テキスト
    this.collisionText = this.add.text(10, 10, "", {
      font: "20px Arial",
      fill: "#ffffff",
    });

    // Initialize Socket.IO
    this.socket = io(); // Connects to the same host and port as the serving page

    // Listen for current_users event (initial state and updates)
    this.socket.on('current_users', (users) => {
        this.now_users = users;
        // console.log("Current connected users:", users);
    });

    // Listen for user_position_update event
    this.socket.on('user_position_update', (user) => {
        // Find and update the user, or add if new
        const existingUserIndex = this.now_users.findIndex(u => u.id === user.id);
        if (existingUserIndex !== -1) {
            this.now_users[existingUserIndex] = user;
        } else {
            this.now_users.push(user);
        }
    });

    // Listen for user_disconnected event
    this.socket.on('user_disconnected', (data) => {
        this.now_users = this.now_users.filter(user => user.id !== data.id);
        if (this.userBlocks[data.id]) {
            this.userBlocks[data.id].destroy();
            delete this.userBlocks[data.id];
        }
    });

    // Listen for initial_blocks event
    this.socket.on('initial_blocks', (blocks) => {
        this.worldBlocks.clear();
        for (const block of blocks) {
            this.worldBlocks.add(JSON.stringify(block)); // Store as string for Set compatibility
        }
        this.renderAllBlocks();
    });

    // Listen for block_created event
    this.socket.on('block_created', (block) => {
        this.worldBlocks.add(JSON.stringify([block.x, block.y]));
        this.renderBlock(block.x, block.y);
    });

    // Listen for block_deleted event
    this.socket.on('block_deleted', (block) => {
        this.worldBlocks.delete(JSON.stringify([block.x, block.y]));
        this.destroyBlock(block.x, block.y);
    });

    // Click handling for block creation/deletion
    this.input.on('pointerdown', (pointer) => {
        // Convert screen coordinates to world coordinates
        const worldX = this.playerWorldX + (pointer.x - this.scale.width / 2);
        const worldY = this.playerWorldY + (pointer.y - this.scale.height / 2);

        // Convert world coordinates to block center coordinates
        const blockX = Math.floor(worldX / BLOCK_SIZE) * BLOCK_SIZE + BLOCK_SIZE / 2;
        const blockY = Math.floor(worldY / BLOCK_SIZE) * BLOCK_SIZE + BLOCK_SIZE / 2;

        const blockKey = JSON.stringify([blockX, blockY]);

        if (this.worldBlocks.has(blockKey)) {
            // Block exists, so delete it
            this.socket.emit('delete_block', { x: blockX, y: blockY });
        } else {
            // Block does not exist, so create it
            this.socket.emit('create_block', { x: blockX, y: blockY });
        }
    });
  }

  sendMyPosition(x, y) {
    this.socket.emit('update_position', { x, y });
  }

  // Helper to render a single block
  renderBlock(x, y) {
    const key = `${x},${y}`;
    if (!this.renderedBlocks[key]) {
        const blk = new Block(this, x, y);
        this.renderedBlocks[key] = blk;
    }
  }

  // Helper to destroy a single block
  destroyBlock(x, y) {
    const key = `${x},${y}`;
    if (this.renderedBlocks[key]) {
        this.renderedBlocks[key].destroy();
        delete this.renderedBlocks[key];
    }
  }

  // Render all blocks based on worldBlocks set
  renderAllBlocks() {
    // Destroy all currently rendered blocks first
    for (const key in this.renderedBlocks) {
        this.renderedBlocks[key].destroy();
    }
    this.renderedBlocks = {};

    // Render blocks from the worldBlocks set
    for (const blockString of this.worldBlocks) {
        const [x, y] = JSON.parse(blockString);
        this.renderBlock(x, y);
    }
  }

  update() {
    const BLOCK_SIZE = 50;

    // 画面中央（プレイヤー固定）
    const px = this.scale.width / 2;
    const py = this.scale.height / 2;

    // プレイヤーの半寸法（描画と同じサイズ前提）
    const halfW = BLOCK_SIZE / 2;
    const halfH = BLOCK_SIZE / 2;

    // ヘルパー： AABB を作る
    const makeAABB = (cx, cy, hw, hh) => ({
      left: cx - hw,
      right: cx + hw,
      top: cy - hh,
      bottom: cy + hh,
    });

    // --- Player Movement and Collision ---
    let newPlayerWorldX = this.playerWorldX;
    let newPlayerWorldY = this.playerWorldY;

    // Apply input to speed
    if (this.cursors.left.isDown) this.speed_x -= 3;
    if (this.cursors.right.isDown) this.speed_x += 3;
    if (this.cursors.up.isDown) this.speed_y -= 3;
    if (this.cursors.down.isDown) this.speed_y += 3;

    // Apply friction
    this.speed_x *= 0.92;
    this.speed_y *= 0.92;
    if (Math.abs(this.speed_x) < 0.01) this.speed_x = 0;
    if (Math.abs(this.speed_y) < 0.01) this.speed_y = 0;

    // Try moving in X
    newPlayerWorldX += this.speed_x;
    let playerAABB_X = makeAABB(newPlayerWorldX, this.playerWorldY, halfW, halfH);
    if (this.aabbIntersectsBlocks(playerAABB_X)) {
        newPlayerWorldX = this.playerWorldX; // Revert X movement
        this.speed_x = 0;
    }

    // Try moving in Y
    newPlayerWorldY += this.speed_y;
    let playerAABB_Y = makeAABB(this.playerWorldX, newPlayerWorldY, halfW, halfH);
    if (this.aabbIntersectsBlocks(playerAABB_Y)) {
        newPlayerWorldY = this.playerWorldY; // Revert Y movement
        this.speed_y = 0;
    }

    this.playerWorldX = newPlayerWorldX;
    this.playerWorldY = newPlayerWorldY;

    // Send position to server if it changed significantly
    if (
      Math.abs(this.playerWorldX - this.lastSentPosition.x) > 1 ||
      Math.abs(this.playerWorldY - this.lastSentPosition.y) > 1
    ) {
      this.sendMyPosition(this.playerWorldX, this.playerWorldY);
      this.lastSentPosition.x = this.playerWorldX;
      this.lastSentPosition.y = this.playerWorldY;
    }

    // Update other users' blocks
    const activeUserIds = new Set();
    this.now_users.forEach((user) => {
      activeUserIds.add(user.id);
      let userBlock = this.userBlocks[user.id];
      if (!userBlock) {
        // Create new block for new user
        userBlock = new Block(this, 0, 0, 0x00ffaa); // Different color for other users
        this.userBlocks[user.id] = userBlock;
      }
      // Update position relative to player's screen position
      userBlock.setPosition(
        px + (user.x - this.playerWorldX),
        py + (user.y - this.playerWorldY)
      );
    });

    // Remove blocks for users who are no longer active
    for (const userId in this.userBlocks) {
      if (!activeUserIds.has(userId)) {
        this.userBlocks[userId].destroy();
        delete this.userBlocks[userId];
      }
    }

    // Debug display
    this.collisionText.setText(
      `DebugInfo:\nplayer { x:${this.playerWorldX}, y:${this.playerWorldY}}\nspeed{ x:${this.speed_x}, y:${this.speed_y}}\nUsers: ${this.now_users.length}`,
    );

    // Block rendering update (world -> screen)
    for (const blockString of this.worldBlocks) {
        const [worldX, worldY] = JSON.parse(blockString);
        const key = `${worldX},${worldY}`;
        const blk = this.renderedBlocks[key];
        if (blk) {
            blk.setPosition(
                px + (worldX - this.playerWorldX),
                py + (worldY - this.playerWorldY)
            );
        }
    }

    // Player is fixed at screen center
    this.player.setPosition(px, py);
  }

  // Helper for AABB collision detection against world blocks
  aabbIntersectsBlocks(aabb) {
    const BLOCK_SIZE = 50;
    for (const blockString of this.worldBlocks) {
      const [blockX, blockY] = JSON.parse(blockString);
      // Block AABB (world coordinates)
      const bLeft = blockX - BLOCK_SIZE / 2;
      const bRight = blockX + BLOCK_SIZE / 2;
      const bTop = blockY - BLOCK_SIZE / 2;
      const bBottom = blockY - BLOCK_SIZE / 2;

      // AABB vs AABB collision detection
      if (
        !(
          aabb.right <= bLeft ||
          aabb.left >= bRight ||
          aabb.bottom <= bTop ||
          aabb.top >= bBottom
        )
      ) {
        return true;
      }
    }
    return false;
  }
}