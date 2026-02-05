export class Group {
  constructor(member) { this.members = new Set(); this.add(member); }
  add(p) { this.members.add(p); p.group = this; }
  merge(other) { for (const p of other.members) this.add(p); }
  move(dx, dy, clamp) { for (const p of this.members) { p.x += dx; p.y += dy; clamp(p); } }
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