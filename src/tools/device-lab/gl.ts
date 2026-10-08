/**
 * A minimal WebGL probe: a moving bar (so dropped frames are visible) plus a full-screen flash on
 * touch (so a high-speed camera can confirm touch-to-photon latency). It owns real GL resources
 * (program and buffer) so context loss and restoration exercise a genuine re-initialisation.
 */
const VERT = `
attribute vec2 a_pos;
uniform vec4 u_rect; // x, y, w, h in clip space
void main() {
  gl_Position = vec4(u_rect.xy + (a_pos * 0.5 + 0.5) * u_rect.zw, 0.0, 1.0);
}`;
const FRAG = `
precision mediump float;
uniform vec4 u_color;
void main() { gl_FragColor = u_color; }`;

export interface GlEvent {
  readonly kind: 'lost' | 'restored';
  readonly atMs: number;
}

export class GlProbe {
  private gl: WebGLRenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private buffer: WebGLBuffer | null = null;
  private rectLoc: WebGLUniformLocation | null = null;
  private colorLoc: WebGLUniformLocation | null = null;
  private lost = false;
  private lostAt = 0;
  private restoredAt = 0;
  private drewAfterRestore = true;
  lostCount = 0;
  restoredCount = 0;
  /** Time from loss to the first frame drawn after restoration; null until measured. */
  restoreToDrawMs: number | null = null;
  readonly supportsForceLose: boolean;

  constructor(
    readonly canvas: HTMLCanvasElement,
    private readonly onEvent: (e: GlEvent) => void,
  ) {
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault(); // required, or the browser never tries to restore
      this.lost = true;
      this.lostAt = performance.now();
      this.lostCount++;
      this.onEvent({ kind: 'lost', atMs: this.lostAt });
    });
    canvas.addEventListener('webglcontextrestored', () => {
      this.initResources();
      this.lost = false;
      this.restoredAt = performance.now();
      this.restoredCount++;
      this.drewAfterRestore = false;
      this.onEvent({ kind: 'restored', atMs: this.restoredAt });
    });
    this.gl = canvas.getContext('webgl', { antialias: false, alpha: false });
    this.initResources();
    this.supportsForceLose = this.gl?.getExtension('WEBGL_lose_context') != null;
  }

  get available(): boolean {
    return this.gl !== null;
  }

  get isLost(): boolean {
    return this.lost || (this.gl?.isContextLost() ?? false);
  }

  /** Lose the context on purpose, then restore it after `restoreAfterMs` (WEBGL_lose_context). */
  forceLose(restoreAfterMs = 1500): boolean {
    const ext = this.gl?.getExtension('WEBGL_lose_context');
    if (!ext) return false;
    ext.loseContext();
    window.setTimeout(() => {
      ext.restoreContext();
    }, restoreAfterMs);
    return true;
  }

  private initResources(): void {
    const gl = this.gl;
    if (!gl || gl.isContextLost()) return;
    const compile = (type: number, src: string): WebGLShader | null => {
      const s = gl.createShader(type);
      if (!s) return null;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };
    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    const program = gl.createProgram();
    if (!vs || !fs) return;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    this.program = program;
    this.rectLoc = gl.getUniformLocation(program, 'u_rect');
    this.colorLoc = gl.getUniformLocation(program, 'u_color');
    this.buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  }

  /** Draw one frame. `phase` in 0..1 moves the bar; `flash` paints the whole canvas white. */
  draw(phase: number, flash: boolean): void {
    const gl = this.gl;
    if (!gl || this.isLost || !this.program) return;
    const w = this.canvas.width;
    const h = this.canvas.height;
    if (this.canvas.clientWidth > 0 && (w === 0 || h === 0)) return;
    gl.viewport(0, 0, w, h);
    if (flash) gl.clearColor(1, 1, 1, 1);
    else gl.clearColor(0.06, 0.07, 0.09, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (!flash) {
      gl.useProgram(this.program);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
      const loc = gl.getAttribLocation(this.program, 'a_pos');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      // A bar sweeping left to right once per second: a hitch shows as a visible jump.
      gl.uniform4f(this.rectLoc, -1 + phase * 1.9, -0.15, 0.1, 0.3);
      gl.uniform4f(this.colorLoc, 0.95, 0.75, 0.2, 1);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    if (!this.drewAfterRestore) {
      this.drewAfterRestore = true;
      this.restoreToDrawMs = performance.now() - this.lostAt;
    }
  }

  get restoredAtMs(): number {
    return this.restoredAt;
  }
}
