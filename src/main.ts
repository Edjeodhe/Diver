import './styles.css';
import { Game } from './core/Game';
import { BoatScene } from './scenes/BoatScene';
import { DiveScene } from './scenes/DiveScene';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const uiRoot = document.getElementById('ui') as HTMLElement;

const game = new Game(canvas, uiRoot);
game.registerScene('dive', () => new DiveScene(game));
game.registerScene('boat', () => new BoatScene(game));
game.loadScene('boat');
game.start();

// 디버그: 브라우저 콘솔에서 game.state 등을 확인/수정
(window as unknown as { game: Game }).game = game;
