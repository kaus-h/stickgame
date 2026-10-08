/**
 * Slim Phaser entry (GMR-99). Modelled on node_modules/phaser/src/phaser-esm.js, but it exports only
 * the namespaces the game touches at runtime, and it only loads the scene plugins the game uses.
 *
 * Built by scripts/build-phaser.mjs into vendor/.build/phaser.mjs (generated, git-ignored) and
 * aliased to `phaser` in vite.config.ts for dev, build and e2e alike. TypeScript types still come
 * from the phaser package, so a type that exists in the .d.ts may be missing at runtime here:
 * see docs/ci.md ("Slim Phaser build") before using a new Phaser system.
 *
 * `phaser-src/` is an alias for node_modules/phaser/src (the package `exports` hide deep paths).
 *
 * Left out on purpose (each one is a namespace root or a self-registering plugin):
 * Physics (Arcade + Matter), Tilemaps, Sound (FEATURE_SOUND=false), Tweens, Loader, Animations
 * namespace, Actions, Curves, Geom/Math namespaces, DOM, Display, Filters, Data plugin, Lights
 * plugin, Gamepad, Camera controls, and every Game Object except the ones below. Core modules
 * still pull some of these in internally (e.g. the texture/animation managers); only their public
 * roots and plugins are gone.
 */

// Load order matters: Phaser's CommonJS modules have require cycles that only resolve when the
// renderer namespace is entered first (renderer/index.js sets its exports before it requires the
// WebGL render nodes, which require it back). The full build gets this from phaser.js's order.
import 'phaser-src/renderer/index.js';

import CONST from 'phaser-src/const.js';

// Core
import Game from 'phaser-src/core/Game.js';
import Scene from 'phaser-src/scene/Scene.js';
import Scale from 'phaser-src/scale/index.js';
import Scene2D from 'phaser-src/cameras/2d/index.js';

// Scene plugins. Each module registers itself with the PluginCache when it is evaluated; a
// DefaultScene plugin that is never registered is skipped silently by the PluginManager.
// Core scene plugins (always installed): EventEmitter, CameraManager (via Scene2D above),
// GameObjectCreator, GameObjectFactory, ScenePlugin, DisplayList, UpdateList.
import 'phaser-src/events/EventEmitter.js';
import 'phaser-src/gameobjects/GameObjectCreator.js';
import 'phaser-src/gameobjects/GameObjectFactory.js';
import 'phaser-src/scene/ScenePlugin.js';
import 'phaser-src/gameobjects/DisplayList.js';
import 'phaser-src/gameobjects/UpdateList.js';
// Default scene plugins we use: Clock (`scene.time`), InputPlugin + KeyboardPlugin (`scene.input.keyboard`).
import 'phaser-src/time/Clock.js';
import 'phaser-src/input/InputPlugin.js';
import 'phaser-src/input/keyboard/KeyboardPlugin.js';

// Game Objects and their `scene.add.*` factories (factories self-register on GameObjectFactory).
import GameObject from 'phaser-src/gameobjects/GameObject.js';
import Graphics from 'phaser-src/gameobjects/graphics/Graphics.js';
import RenderTexture from 'phaser-src/gameobjects/rendertexture/RenderTexture.js';
import Text from 'phaser-src/gameobjects/text/Text.js';
import TileSprite from 'phaser-src/gameobjects/tilesprite/TileSprite.js';
import 'phaser-src/gameobjects/graphics/GraphicsFactory.js';
import 'phaser-src/gameobjects/rendertexture/RenderTextureFactory.js';
import 'phaser-src/gameobjects/text/TextFactory.js';
import 'phaser-src/gameobjects/tilesprite/TileSpriteFactory.js';

export { Game, Scene, Scale };
export const Cameras = { Scene2D };
export const GameObjects = { GameObject, Graphics, RenderTexture, Text, TileSprite };

export const VERSION = CONST.VERSION;
export const LOG_VERSION = CONST.LOG_VERSION;
export const AUTO = CONST.AUTO;
export const CANVAS = CONST.CANVAS;
export const WEBGL = CONST.WEBGL;
export const HEADLESS = CONST.HEADLESS;
export const FOREVER = CONST.FOREVER;
export const NONE = CONST.NONE;
export const LEFT = CONST.LEFT;
export const RIGHT = CONST.RIGHT;
export const UP = CONST.UP;
export const DOWN = CONST.DOWN;

export default {
  Game,
  Scene,
  Scale,
  Cameras,
  GameObjects,
  VERSION,
  LOG_VERSION,
  AUTO,
  CANVAS,
  WEBGL,
  HEADLESS,
  FOREVER,
  NONE,
  LEFT,
  RIGHT,
  UP,
  DOWN,
};
