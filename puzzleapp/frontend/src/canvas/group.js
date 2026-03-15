export class Group {
  constructor(member) { this.members = new Set(); this.add(member); }
  add(p) { this.members.add(p); p.group = this; }
  merge(other) { for (const p of other.members) this.add(p); }

  // Move group as a rigid body - all pieces maintain relative positions
  move(dx, dy, clamp) { 
    // First, move all pieces together
    for (const p of this.members) { 
      p.x += dx; 
      p.y += dy; 
    }

    // Then clamp the entire group bounds (not individual pieces!)
    // This ensures pieces stay in fixed relative positions
    const bounds = this.getBounds();

    // Calculate needed adjustment to keep group in canvas
    let adjustX = 0, adjustY = 0;

    if (bounds.x < 0) adjustX = -bounds.x;
    if (bounds.y < 0) adjustY = -bounds.y;
    if (bounds.x + bounds.w > width) adjustX = width - (bounds.x + bounds.w);
    if (bounds.y + bounds.h > height) adjustY = height - (bounds.y + bounds.h);

    // Apply adjustment to all pieces equally (rigid body)
    if (adjustX !== 0 || adjustY !== 0) {
      for (const p of this.members) {
        p.x += adjustX;
        p.y += adjustY;
      }
    }
  }

  draw(drawPiece) { for (const p of this.members) p.draw(drawPiece); }
  getCenter() {
    let minx=Infinity,miny=Infinity,maxx=-Infinity,maxy=-Infinity;
    for (const p of this.members) { minx=Math.min(minx,p.x); miny=Math.min(miny,p.y); maxx=Math.max(maxx,p.x+p.sw); maxy=Math.max(maxy,p.y+p.sh); }
    return { cx:(minx+maxx)/2, cy:(miny+maxy)/2 };
  }
  getBounds() {
    let minx=Infinity,miny=Infinity,maxx=-Infinity,maxy=-Infinity;
    for (const p of this.members) { minx=Math.min(minx,p.x); miny=Math.min(miny,p.y); maxx=Math.max(maxx,p.x+p.sw); maxy=Math.max(maxy,p.y+p.sh); }
    return { x:minx, y:miny, w:maxx-minx, h:maxy-miny };
  }
}