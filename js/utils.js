// Hàm tính khoảng cách Euclid giữa 2 điểm (các điểm có thuộc tính .x và .y)
function distance(p1, p2) {
    return Math.hypot(p1.x - p2.x, p1.y - p2.y);
  }
  