import { loadSettings } from './lib/settings';
import { ParticleNetwork } from './lib/particle-network';
import { createPanel } from './panel';

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const settings = loadSettings();

const network = new ParticleNetwork(canvas, settings);
network.start();

canvas.addEventListener('pointermove', (event) => {
  network.setPointer(event.offsetX, event.offsetY);
});
canvas.addEventListener('pointerdown', (event) => {
  network.setPointer(event.offsetX, event.offsetY);
  network.emitShockwave(event.offsetX, event.offsetY);
});
canvas.addEventListener('pointerleave', () => network.clearPointer());
canvas.addEventListener('pointercancel', () => network.clearPointer());

createPanel(settings, network);
