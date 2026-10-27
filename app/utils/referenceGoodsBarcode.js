// Barcode geometry recovered from GoodsLabel.dc.html. Keep quiet zones and EAN guard bars.
    const C128 = ('212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 123122 123221 223211 221132 221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 232121 111323 131123 131321 112313 132113 132311 211313 231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 114131 311141 411131 211412 211214 211232 2331112').split(' ');
    const code128 = (text, x, h) => {
      const v = [];
      if (/^\d{4,}$/.test(text)) {
        v.push(105);
        const n = text.length - (text.length % 2);
        for (let i = 0; i < n; i += 2) v.push(Number(text.slice(i, i + 2)));
        if (n < text.length) v.push(100, text.charCodeAt(n) - 32);
      } else {
        v.push(104);
        for (const ch of text) v.push(ch.charCodeAt(0) - 32);
      }
      v.push(v.reduce((s, c, i) => s + c * (i || 1), 0) % 103, 106);
      const seq = v.map((c) => C128[c]).join('');
      const total = [...seq].reduce((s, c) => s + Number(c), 0) + 20;
      const k = 1000 / total;
      let pos = 10;
      let d = '';
      [...seq].forEach((c, i) => {
        const w = Number(c);
        if (i % 2 === 0) d += 'M' + (pos * k).toFixed(2) + ' 0h' + (w * k).toFixed(2) + 'v100h-' + (w * k).toFixed(2) + 'z';
        pos += w;
      });
      return { d, w: (total * x).toFixed(1) + 'px', h: h + 'px' };
    };
    // EAN-13：商品编码是 13 位数字且校验位正确（合法 JAN）时使用；静区左 11 / 右 7 模块，起止符与中间分隔符加长
    const EAN_L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
    const EAN_G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
    const EAN_R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100'];
    const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];
    const isJan = (c) => /^\d{13}$/.test(c)
      && (10 - ([...c.slice(0, 12)].reduce((s, d, i) => s + Number(d) * (i % 2 ? 3 : 1), 0) % 10)) % 10 === Number(c[12]);
    const ean13 = (c, x) => {
      const first = Number(c[0]);
      let bits = '101';
      for (let i = 1; i <= 6; i += 1) bits += (PARITY[first][i - 1] === 'L' ? EAN_L : EAN_G)[Number(c[i])];
      bits += '01010';
      for (let i = 7; i <= 12; i += 1) bits += EAN_R[Number(c[i])];
      bits += '101';
      const total = 11 + 95 + 7;
      const k = 1000 / total;
      let d = '';
      [...bits].forEach((b, i) => {
        if (b !== '1') return;
        const guard = i < 3 || (i >= 45 && i < 50) || i >= 92;
        d += 'M' + ((11 + i) * k).toFixed(2) + ' 0h' + k.toFixed(2) + 'v' + (guard ? 100 : 76) + 'h-' + k.toFixed(2) + 'z';
      });
      const px = (m) => (m * x).toFixed(1) + 'px';
      return { d, w: px(total), qL: px(11), lL: px(14), rL: px(61), gW: px(42), first: c[0], left: c.slice(1, 7), right: c.slice(7) };
    };

export function referenceGoodsBarcode(code) {
 return isJan(code) ? {format:"EAN13", ...ean13(code,2.49)} : {format:"CODE128", ...code128(code,2.42,68)}
}
