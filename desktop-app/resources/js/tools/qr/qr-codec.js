// QR Code generation for the DevToys-style QR tool.
(function(root) {
  "use strict";

  const VERSION_SPECS = [
    null,
    { version: 1, size: 21, dataCodewords: 19, errorCodewords: 7, byteCapacity: 17 },
    { version: 2, size: 25, dataCodewords: 34, errorCodewords: 10, byteCapacity: 32 },
    { version: 3, size: 29, dataCodewords: 55, errorCodewords: 15, byteCapacity: 53 },
    { version: 4, size: 33, dataCodewords: 80, errorCodewords: 20, byteCapacity: 78 },
    { version: 5, size: 37, dataCodewords: 108, errorCodewords: 26, byteCapacity: 106 }
  ];

  const FORMAT_POLY = 0x537;
  const FORMAT_MASK = 0x5412;

  function getUtf8Bytes(text) {
    if (typeof TextEncoder !== "undefined") return Array.from(new TextEncoder().encode(String(text || "")));
    return Array.from(Buffer.from(String(text || ""), "utf8"));
  }

  function chooseVersion(byteLength) {
    const spec = VERSION_SPECS.find((candidate) => candidate && byteLength <= candidate.byteCapacity);
    if (!spec) throw new Error("Text is too long for this QR generator.");
    return spec;
  }

  function appendBits(bits, value, length) {
    for (let index = length - 1; index >= 0; index -= 1) {
      bits.push((value >>> index) & 1);
    }
  }

  function createDataCodewords(bytes, spec) {
    const bits = [];
    appendBits(bits, 0x4, 4);
    appendBits(bits, bytes.length, 8);
    bytes.forEach((byte) => appendBits(bits, byte, 8));
    const capacityBits = spec.dataCodewords * 8;
    appendBits(bits, 0, Math.min(4, capacityBits - bits.length));
    while (bits.length % 8) bits.push(0);
    const codewords = [];
    for (let index = 0; index < bits.length; index += 8) {
      codewords.push(bits.slice(index, index + 8).reduce((value, bit) => (value << 1) | bit, 0));
    }
    for (let padIndex = 0; codewords.length < spec.dataCodewords; padIndex += 1) {
      codewords.push(padIndex % 2 === 0 ? 0xec : 0x11);
    }
    return codewords;
  }

  function multiplyGf(left, right) {
    let product = 0;
    for (let index = 0; index < 8; index += 1) {
      if (right & 1) product ^= left;
      const carry = left & 0x80;
      left = (left << 1) & 0xff;
      if (carry) left ^= 0x1d;
      right >>>= 1;
    }
    return product;
  }

  function powGf(value, power) {
    let result = 1;
    for (let index = 0; index < power; index += 1) result = multiplyGf(result, value);
    return result;
  }

  function createGeneratorPolynomial(degree) {
    let polynomial = [1];
    for (let index = 0; index < degree; index += 1) {
      const factor = [1, powGf(2, index)];
      const next = new Array(polynomial.length + 1).fill(0);
      polynomial.forEach((coefficient, coefficientIndex) => {
        next[coefficientIndex] ^= multiplyGf(coefficient, factor[0]);
        next[coefficientIndex + 1] ^= multiplyGf(coefficient, factor[1]);
      });
      polynomial = next;
    }
    return polynomial;
  }

  function createErrorCodewords(dataCodewords, errorCodewordCount) {
    const generator = createGeneratorPolynomial(errorCodewordCount);
    const remainder = new Array(errorCodewordCount).fill(0);
    dataCodewords.forEach((codeword) => {
      const factor = codeword ^ remainder.shift();
      remainder.push(0);
      generator.slice(1).forEach((coefficient, index) => {
        remainder[index] ^= multiplyGf(coefficient, factor);
      });
    });
    return remainder;
  }

  function createMatrix(size) {
    return {
      modules: Array.from({ length: size }, () => new Array(size).fill(false)),
      reserved: Array.from({ length: size }, () => new Array(size).fill(false))
    };
  }

  function setModule(matrix, row, col, value, reserved = true) {
    if (row < 0 || col < 0 || row >= matrix.modules.length || col >= matrix.modules.length) return;
    matrix.modules[row][col] = value === true;
    if (reserved) matrix.reserved[row][col] = true;
  }

  function placeFinder(matrix, top, left) {
    for (let row = -1; row <= 7; row += 1) {
      for (let col = -1; col <= 7; col += 1) {
        const absoluteRow = top + row;
        const absoluteCol = left + col;
        const isFinder = row >= 0 && row <= 6 && col >= 0 && col <= 6
          && (row === 0 || row === 6 || col === 0 || col === 6 || (row >= 2 && row <= 4 && col >= 2 && col <= 4));
        setModule(matrix, absoluteRow, absoluteCol, isFinder, true);
      }
    }
  }

  function placeFunctionPatterns(matrix, version) {
    const size = matrix.modules.length;
    placeFinder(matrix, 0, 0);
    placeFinder(matrix, 0, size - 7);
    placeFinder(matrix, size - 7, 0);
    for (let index = 8; index < size - 8; index += 1) {
      setModule(matrix, 6, index, index % 2 === 0, true);
      setModule(matrix, index, 6, index % 2 === 0, true);
    }
    if (version >= 2) {
      const center = size - 7;
      for (let row = -2; row <= 2; row += 1) {
        for (let col = -2; col <= 2; col += 1) {
          const value = Math.max(Math.abs(row), Math.abs(col)) !== 1;
          setModule(matrix, center + row, center + col, value, true);
        }
      }
    }
    setModule(matrix, size - 8, 8, true, true);
    for (let index = 0; index < 9; index += 1) {
      if (index !== 6) {
        matrix.reserved[8][index] = true;
        matrix.reserved[index][8] = true;
      }
    }
    for (let index = 0; index < 8; index += 1) {
      matrix.reserved[8][size - 1 - index] = true;
      matrix.reserved[size - 1 - index][8] = true;
    }
  }

  function shouldMask(row, col) {
    return (row + col) % 2 === 0;
  }

  function placeData(matrix, codewords) {
    const bits = [];
    codewords.forEach((codeword) => appendBits(bits, codeword, 8));
    const size = matrix.modules.length;
    let bitIndex = 0;
    let upward = true;
    for (let col = size - 1; col > 0; col -= 2) {
      if (col === 6) col -= 1;
      for (let offset = 0; offset < size; offset += 1) {
        const row = upward ? size - 1 - offset : offset;
        for (let pair = 0; pair < 2; pair += 1) {
          const currentCol = col - pair;
          if (matrix.reserved[row][currentCol]) continue;
          const raw = bits[bitIndex] === 1;
          matrix.modules[row][currentCol] = shouldMask(row, currentCol) ? !raw : raw;
          bitIndex += 1;
        }
      }
      upward = !upward;
    }
  }

  function createFormatBits() {
    let value = (1 << 3) | 0;
    let data = value << 10;
    for (let bit = 14; bit >= 10; bit -= 1) {
      if ((data >>> bit) & 1) data ^= FORMAT_POLY << (bit - 10);
    }
    return ((value << 10) | data) ^ FORMAT_MASK;
  }

  function placeFormatBits(matrix) {
    const size = matrix.modules.length;
    const bits = createFormatBits();
    const first = [[8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8], [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]];
    const second = [[size - 1, 8], [size - 2, 8], [size - 3, 8], [size - 4, 8], [size - 5, 8], [size - 6, 8], [size - 7, 8], [8, size - 8], [8, size - 7], [8, size - 6], [8, size - 5], [8, size - 4], [8, size - 3], [8, size - 2], [8, size - 1]];
    first.forEach(([row, col], index) => setModule(matrix, row, col, ((bits >>> index) & 1) === 1, true));
    second.forEach(([row, col], index) => setModule(matrix, row, col, ((bits >>> index) & 1) === 1, true));
  }

  function escapeXml(value) {
    return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function renderSvg(matrix, options = {}) {
    const quietZone = Number.isFinite(options.quietZone) ? options.quietZone : 4;
    const moduleSize = Number.isFinite(options.moduleSize) ? options.moduleSize : 8;
    const size = matrix.length;
    const viewBoxSize = size + quietZone * 2;
    const rects = [];
    matrix.forEach((row, rowIndex) => {
      row.forEach((value, colIndex) => {
        if (value) rects.push(`<rect x="${colIndex + quietZone}" y="${rowIndex + quietZone}" width="1" height="1"/>`);
      });
    });
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${viewBoxSize * moduleSize}" height="${viewBoxSize * moduleSize}" viewBox="0 0 ${viewBoxSize} ${viewBoxSize}" role="img" aria-label="${escapeXml(options.label || "QR Code")}"><rect width="100%" height="100%" fill="#fff"/><g fill="#000">${rects.join("")}</g></svg>`;
  }

  function encodeText(text, options = {}) {
    const bytes = getUtf8Bytes(text);
    if (!bytes.length) return { text: "", svg: "", matrix: [], version: null };
    const spec = chooseVersion(bytes.length);
    const dataCodewords = createDataCodewords(bytes, spec);
    const errorCodewords = createErrorCodewords(dataCodewords, spec.errorCodewords);
    const matrix = createMatrix(spec.size);
    placeFunctionPatterns(matrix, spec.version);
    placeData(matrix, dataCodewords.concat(errorCodewords));
    placeFormatBits(matrix);
    return {
      text: String(text || ""),
      version: spec.version,
      svg: renderSvg(matrix.modules, options),
      matrix: matrix.modules.map((row) => row.slice())
    };
  }

  function registerMarkdownViewerQrCodec(app) {
    const api = { encodeText };
    app?.registerModule?.("qrCodec", api);
    return api;
  }

  root.registerMarkdownViewerQrCodec = registerMarkdownViewerQrCodec;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { encodeText, registerMarkdownViewerQrCodec, _test: { chooseVersion, createFormatBits } };
  }
})(typeof window !== "undefined" ? window : globalThis);
