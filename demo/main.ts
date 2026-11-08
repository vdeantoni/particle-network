import { ParticleNetwork } from '../src/index';
import { createPanel } from '../src/panel';

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const container = document.getElementById('panel')!;
const toggle = document.getElementById('panel-toggle')!;

const network = new ParticleNetwork(canvas, {
  storageKey: 'particle-network-settings',
});
createPanel(network, container);

const togglePanel = () => {
  container.hidden = !container.hidden;
  toggle.setAttribute('aria-expanded', String(!container.hidden));
};
toggle.addEventListener('click', togglePanel);
window.addEventListener('keydown', (event) => {
  if (
    event.key.toLowerCase() !== 'h' ||
    event.metaKey ||
    event.ctrlKey ||
    event.altKey ||
    event.target instanceof HTMLInputElement
  ) {
    return;
  }
  togglePanel();
});
