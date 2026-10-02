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
  float a = texture2D(u_tex, v_uv).a * v_color.a;
  if (a < 0.01) discard;
  gl_FragColor = vec4(v_color.rgb, a);
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

  constructor(readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl', { alpha: false, antialias: false });
    if (!gl) throw new Error('WebGL is not available');
    this.gl = gl;
    this.atlas = buildAtlas();
    this.sprites = this.atlas.sprites;

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

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
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
    const w = Math.round(VIEW_W * s);
    const h = Math.round(VIEW_H * s);
    this.canvas.width = w;
    this.canvas.height = h;
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

  /** Queue a sprite at integer logical pixel coordinates. */
  draw(s: Sprite, x: number, y: number, c: RGB, alpha = 1, flipX = false): void {
    if (this.count >= MAX_QUADS) return;
    x = Math.round(x);
    y = Math.round(y);
    const aw = this.atlas.width, ah = this.atlas.height;
    let u0 = s.x / aw, u1 = (s.x + s.w) / aw;
    const v0 = s.y / ah, v1 = (s.y + s.h) / ah;
    if (flipX) [u0, u1] = [u1, u0];
    const i = this.count * 8;
    this.pos.set([x, y, x + s.w, y, x, y + s.h, x + s.w, y + s.h], i);
    this.uv.set([u0, v0, u1, v0, u0, v1, u1, v1], i);
    const k = this.count * 16;
    for (let n = 0; n < 4; n++) {
      this.color[k + n * 4] = c[0];
      this.color[k + n * 4 + 1] = c[1];
      this.color[k + n * 4 + 2] = c[2];
      this.color[k + n * 4 + 3] = alpha;
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
    const a = this.bufferInfo.attribs!;
    twgl.setAttribInfoBufferFromArray(gl, a.a_pos, this.pos);
    twgl.setAttribInfoBufferFromArray(gl, a.a_uv, this.uv);
    twgl.setAttribInfoBufferFromArray(gl, a.a_color, this.color);
    gl.useProgram(this.programInfo.program);
    twgl.setBuffersAndAttributes(gl, this.programInfo, this.bufferInfo);
    twgl.setUniforms(this.programInfo, { u_view: [VIEW_W, VIEW_H], u_tex: this.texture });
    twgl.drawBufferInfo(gl, this.bufferInfo, gl.TRIANGLES, this.count * 6);
    gl.disable(gl.SCISSOR_TEST);
    this.count = 0;
  }

  get pixelScale(): number {
    return this.scale;
  }
}
