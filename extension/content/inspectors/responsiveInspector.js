export const responsiveInspector = {
  findOverflow() {
    const bodyWidth = document.body.scrollWidth;
    const overflow = [];
    document.querySelectorAll('*').forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.right > bodyWidth + 1) {
        overflow.push({
          tag: el.tagName.toLowerCase(),
          id: el.id || undefined,
          classes: el.className || undefined,
          right: rect.right,
          bodyWidth,
        });
      }
    });
    return overflow;
  },

  findOverlaps() {
    const elements = Array.from(document.querySelectorAll('*'));
    const overlaps = [];
    for (let i = 0; i < elements.length; i++) {
      for (let j = i + 1; j < elements.length; j++) {
        const a = elements[i].getBoundingClientRect();
        const b = elements[j].getBoundingClientRect();
        if (a.width > 0 && b.width > 0 &&
            a.left < b.right && a.right > b.left &&
            a.top < b.bottom && a.bottom > b.top) {
          overlaps.push({
            a: { tag: elements[i].tagName.toLowerCase(), id: elements[i].id },
            b: { tag: elements[j].tagName.toLowerCase(), id: elements[j].id },
          });
          if (overlaps.length >= 20) return overlaps; // cap
        }
      }
    }
    return overlaps;
  },
};
