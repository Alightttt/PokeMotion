export class AudioEngine {
  constructor() {
    this.ctx = null;
  }

  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
  }

  playDialTone() {
    if (!this.ctx) return;
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc1.frequency.value = 350;
    osc2.frequency.value = 440;
    gain.gain.value = 0.1;

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.ctx.destination);

    osc1.start();
    osc2.start();

    return () => {
      osc1.stop();
      osc2.stop();
    };
  }

  playRingTone() {
    if (!this.ctx) return;
    let stop = false;
    const play = () => {
      if (stop) return;
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc1.frequency.value = 440;
      osc2.frequency.value = 480;
      gain.gain.setValueAtTime(0, this.ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.1, this.ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.1, this.ctx.currentTime + 2);
      gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 2.1);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(this.ctx.destination);

      osc1.start();
      osc2.start();
      osc1.stop(this.ctx.currentTime + 2.1);
      osc2.stop(this.ctx.currentTime + 2.1);
      
      setTimeout(play, 4000);
    };
    play();
    return () => { stop = true; };
  }
}

export const audioEngine = new AudioEngine();
