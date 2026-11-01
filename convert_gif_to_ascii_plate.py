import os
import sys
import math
import json
from PIL import Image, ImageSequence
import numpy as np
from scipy.ndimage import sobel

def convert_gif_to_plate(gif_path, out_name=None, max_frames=48, target_fps=12, frame_w=240, frame_h=240):
    if not os.path.exists(gif_path):
        print(f"File not found: {gif_path}")
        return False
    
    if not out_name:
        base = os.path.splitext(os.path.basename(gif_path))[0]
        out_name = f"motion-{base}"
        
    os.makedirs('plates', exist_ok=True)
    out_json = os.path.join('plates', f"{out_name}.json")
    out_png = os.path.join('plates', f"{out_name}.png")
    
    im = Image.open(gif_path)
    raw_frames = [f.copy().convert('RGB') for f in ImageSequence.Iterator(im)]
    total_raw = len(raw_frames)
    
    # Subsample if too many frames
    if total_raw > max_frames:
        step = total_raw / max_frames
        indices = [int(i * step) for i in range(max_frames)]
        frames = [raw_frames[i] for i in indices]
    else:
        frames = raw_frames
        
    n_frames = len(frames)
    # Calculate atlas dimensions (square-ish grid)
    grid_cols = math.ceil(math.sqrt(n_frames))
    grid_rows = math.ceil(n_frames / grid_cols)
    
    atlas_w = grid_cols * frame_w
    atlas_h = grid_rows * frame_h
    
    atlas = np.zeros((atlas_h, atlas_w, 4), dtype=np.uint8)
    atlas[:, :, 3] = 255 # opaque alpha
    
    for idx, f in enumerate(frames):
        # Resize frame to frame_w x frame_h
        resized = f.resize((frame_w, frame_h), Image.Resampling.LANCZOS)
        gray = np.array(resized.convert('L'), dtype=np.float32)
        
        # If background is bright, invert; if dark, keep
        # For ASCII art ink: high value = more ink.
        # Sobel edge filter
        sx = sobel(gray, axis=1)
        sy = sobel(gray, axis=0)
        mag = np.hypot(sx, sy)
        edge = np.clip(mag / 4.0, 0, 255).astype(np.uint8)
        ink = np.clip(gray, 0, 255).astype(np.uint8)
        
        col_idx = idx % grid_cols
        row_idx = idx // grid_cols
        
        y0 = row_idx * frame_h
        y1 = y0 + frame_h
        x0 = col_idx * frame_w
        x1 = x0 + frame_w
        
        atlas[y0:y1, x0:x1, 0] = ink
        atlas[y0:y1, x0:x1, 1] = edge
        atlas[y0:y1, x0:x1, 2] = 0
        
    atlas_img = Image.fromarray(atlas, 'RGBA')
    atlas_img.save(out_png, 'PNG', optimize=True)
    
    meta = {
        "cols": frame_w,
        "rows": frame_h,
        "cellW": 5,
        "cellH": 8,
        "frames": n_frames,
        "fps": target_fps,
        "atlas": [grid_cols, grid_rows],
        "png": f"/plates/{out_name}.png"
    }
    
    with open(out_json, 'w', encoding='utf-8') as f:
        json.dump(meta, f, indent=2)
        
    print(f"Successfully generated {out_json} and {out_png} ({n_frames} frames, atlas {grid_cols}x{grid_rows})")
    return True

if __name__ == '__main__':
    if len(sys.argv) > 1:
        convert_gif_to_plate(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
    else:
        print("Usage: python convert_gif_to_ascii_plate.py <input.gif> [output_name]")
