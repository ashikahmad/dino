import * as twgl from 'twgl.js';
import { buildAtlas, type Atlas, type Sprite, type Sprites } from './sprites';

export const VIEW_W = 600;
export const VIEW_H = 150;

export type RGB = [number, number, number];

const MAX_QUADS = 512;

const vs = `
attribute vec2 a_pos;
attribute vec2 a_uv;
attribute vec4 a_color;
uniform vec2 u_view;
varying vec2 v_uv;
varying vec4 v_color;
void main() {
  vec2 p = a_pos / u_view * 2.0 - 1.0;
  gl_Position = vec4(p.x, -p.y, 0.0, 1.0);
  v_uv = a_uv;
  v_color = a_color;
}`;

const fs = `
precision mediump float;
uniform sampler2D u_tex;
varying vec2 v_uv;
varying vec4 v_color;
void main() {
  gl_FragColor = vec4(v_color.rgb, texture2D(u_tex, v_uv).a * v_color.a);
}`;

/** Batches textured quads from one sprite atlas and draws them in a single call. */
export class Renderer {
  readonly sprites: Sprites;
  private gl: WebGLRenderingContext;
  private atlas: Atlas;
  private programInfo: twgl.ProgramInfo;
  private bufferInfo: twgl.BufferInfo;
  private texture: WebGLTexture;
  private pos = new Float32Array(MAX_QUADS * 8);
  private uv = new Float32Array(MAX_QUADS * 8);
  private color = new Float32Array(MAX_QUADS * 16);
  private count = 0;
  private scale = 1;
  private invScale = 1;
  private invW: number;
  private invH: number;
  private buffers: NonNullable<twgl.BufferInfo['attribs']>;

  constructor(readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false });
    if (!gl) throw new Error('WebGL is not available');
    this.gl = gl;
    this.atlas = buildAtlas();
    this.sprites = this.atlas.sprites;
    this.invW = 1 / this.atlas.width;
    this.invH = 1 / this.atlas.height;

    this.programInfo = twgl.createProgramInfo(gl, [vs, fs]);

    const indices = new Uint16Array(MAX_QUADS * 6);
    for (let q = 0; q < MAX_QUADS; q++) {
      const v = q * 4;
      indices.set([v, v + 1, v + 2, v + 2, v + 1, v + 3], q * 6);
    }
    this.bufferInfo = twgl.createBufferInfoFromArrays(gl, {
      a_pos: { numComponents: 2, data: this.pos, drawType: gl.DYNAMIC_DRAW },
      a_uv: { numComponents: 2, data: this.uv, drawType: gl.DYNAMIC_DRAW },
      a_color: { numComponents: 4, data: this.color, drawType: gl.DYNAMIC_DRAW },
      indices,
    });

    this.texture = twgl.createTexture(gl, {
      src: this.atlas.pixels,
      width: this.atlas.width,
      height: this.atlas.height,
      format: gl.RGBA,
      min: gl.NEAREST,
      mag: gl.NEAREST,
      wrap: gl.CLAMP_TO_EDGE,
    });

    // everything below stays bound for the life of the context: nothing else draws
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(this.programInfo.program);
    twgl.setBuffersAndAttributes(gl, this.programInfo, this.bufferInfo);
    twgl.setUniforms(this.programInfo, { u_view: [VIEW_W, VIEW_H], u_tex: this.texture });
    this.buffers = this.bufferInfo.attribs!;
  }

  /**
   * Size the canvas to fit the window. Prefers whole-number scale factors so
   * pixels stay square and crisp; falls back to a fractional scale on small screens.
   */
  resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const availW = Math.min(window.innerWidth, 1200) * dpr;
    const availH = window.innerHeight * dpr;
    let s = Math.min(availW / VIEW_W, availH / VIEW_H);
    if (s >= 2) s = Math.floor(s);
    this.scale = s;
    this.invScale = 1 / s;
    const w = Math.round(VIEW_W * s);
    const h = Math.round(VIEW_H * s);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w; // resizing reallocates the drawing buffer, so only when it changed
      this.canvas.height = h;
    }
    this.canvas.style.width = `${w / dpr}px`;
    this.canvas.style.height = `${h / dpr}px`;
    this.gl.viewport(0, 0, w, h);
  }

  begin(sky: RGB): void {
    const gl = this.gl;
    gl.clearColor(sky[0], sky[1], sky[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    this.count = 0;
  }

  /** Queue a sprite at a logical pixel position (snapped to the nearest device pixel). */
  draw(s: Sprite, x: number, y: number, c: RGB, alpha = 1, flipX = false, scale = 1): void {
    if (this.count >= MAX_QUADS) return;
    // snap to a device pixel: the sprites stay sharp and slow motion moves in the finest steps the screen has
    x = Math.round(x * this.scale) * this.invScale;
    y = Math.round(y * this.scale) * this.invScale;
    const x1 = x + s.w * scale, y1 = y + s.h * scale;
    let u0 = s.x * this.invW, u1 = (s.x + s.w) * this.invW;
    const v0 = s.y * this.invH, v1 = (s.y + s.h) * this.invH;
    if (flipX) {
      const t = u0;
      u0 = u1;
      u1 = t;
    }
    const pos = this.pos, uv = this.uv, color = this.color;
    const i = this.count * 8;
    pos[i] = x; pos[i + 1] = y; pos[i + 2] = x1; pos[i + 3] = y;
    pos[i + 4] = x; pos[i + 5] = y1; pos[i + 6] = x1; pos[i + 7] = y1;
    uv[i] = u0; uv[i + 1] = v0; uv[i + 2] = u1; uv[i + 3] = v0;
    uv[i + 4] = u0; uv[i + 5] = v1; uv[i + 6] = u1; uv[i + 7] = v1;
    for (let k = this.count * 16, end = k + 16; k < end; k += 4) {
      color[k] = c[0];
      color[k + 1] = c[1];
      color[k + 2] = c[2];
      color[k + 3] = alpha;
    }
    this.count++;
  }

  /**
   * Draw everything queued so far. With clipY, only the part of the batch above
   * that logical y is kept (used so the sun and moon rise from behind the ground).
   */
  flush(clipY?: number): void {
    const gl = this.gl;
    if (this.count === 0) return;
    if (clipY !== undefined) {
      const h = Math.round(clipY * this.scale);
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(0, this.canvas.height - h, this.canvas.width, h);
    }
    // upload only the quads queued, not the whole buffers
    const n = this.count;
    this.upload(this.buffers.a_pos.buffer, this.pos.subarray(0, n * 8));
    this.upload(this.buffers.a_uv.buffer, this.uv.subarray(0, n * 8));
    this.upload(this.buffers.a_color.buffer, this.color.subarray(0, n * 16));
    gl.drawElements(gl.TRIANGLES, n * 6, gl.UNSIGNED_SHORT, 0);
    gl.disable(gl.SCISSOR_TEST);
    this.count = 0;
  }

  private upload(buffer: WebGLBuffer, data: Float32Array): void {
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
    this.gl.bufferSubData(this.gl.ARRAY_BUFFER, 0, data);
  }

  get pixelScale(): number {
    return this.scale;
  }
}
