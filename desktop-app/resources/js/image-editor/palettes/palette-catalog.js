// Immutable color-palette definitions and toolbar swatch resolution for the image editor.
(function(global, factory) {
  "use strict";

  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};
  namespace.ImageEditorPaletteCatalog = api;
})(typeof window !== "undefined" ? window : globalThis, function() {
  "use strict";

  const DEFAULT_PALETTE_COLORS = Object.freeze([
    "#000000", "#7F7F7F", "#880015", "#ED1C24", "#FF7F27",
    "#FFF200", "#22B14C", "#00A2E8", "#3F48CC", "#A349A4",
    "#FFFFFF", "#C3C3C3", "#B97A57", "#FFAEC9", "#FFC90E",
    "#EFE4B0", "#B5E61D", "#99D9EA", "#7092BE", "#C8BFE7"
  ]);
  const BASIC_COLORS = Object.freeze(["#000000", "#FFFFFF", "#FF0000", "#00FF00", "#0000FF", "#FFFF00", "#FF69B4", "#FFA500"]);
  const BUILT_IN_PALETTE_DATA = Object.freeze([
    ["warm-sunrise", "Warm Sunrise", ["#FFF3E8", "#3B1D2A", "#FF8A5B", "#D9584C", "#FFD166", "#F2A65A", "#E85D75", "#7A3E65", "#F7C59F", "#C97B63", "#8C5E58", "#5C403D"]],
    ["sunny-day", "Sunny Day", ["#FFFBE6", "#234E70", "#FFD93D", "#F4B400", "#53C8F0", "#168AAD", "#72D572", "#2F855A", "#FFF0A6", "#C9E9F6", "#6886A5", "#263238"]],
    ["golden-hour", "Golden Hour", ["#FFF4DC", "#4A2416", "#F6B44B", "#D77A24", "#FFDA79", "#E8A03A", "#C85A32", "#8F3F2B", "#F5C99B", "#C98C63", "#8A5A44", "#51372D"]],
    ["warm-spring", "Warm Spring", ["#FFF5E7", "#56321F", "#F3A847", "#D97925", "#79C267", "#3D8D53", "#F36F5B", "#C94745", "#F8D174", "#B7D46A", "#9A7153", "#4E4A38"]],
    ["autumn-ember", "Autumn Ember", ["#FAE9D5", "#321A18", "#C84B31", "#8E2D24", "#E49B3F", "#B66A25", "#7A8B3A", "#4F612C", "#D7B07A", "#A86545", "#6E4B3A", "#382C28"]],
    ["terracotta", "Terracotta", ["#F7E7DE", "#3D2422", "#C96F52", "#9E4A3D", "#E7A183", "#C47D69", "#D8B08C", "#AC8068", "#F2CFC0", "#B88C7B", "#7B5D55", "#453936"]],
    ["desert-sand", "Desert Sand", ["#FBF1DA", "#463425", "#D7A75B", "#A87532", "#E8C987", "#C39C5F", "#B97745", "#8D5536", "#F2DFC2", "#BBA68A", "#786B5C", "#443E37"]],
    ["earth-clay", "Earth & Clay", ["#EEE4D6", "#302620", "#A76843", "#75432F", "#C8946B", "#9B6B4F", "#7C8B5A", "#56613E", "#D7C2A8", "#A99883", "#6D6257", "#39332E"]],
    ["forest-walk", "Forest Walk", ["#EDF4E8", "#17271C", "#3F7D44", "#24552D", "#86A95D", "#5E7F3C", "#B09055", "#80663A", "#C9D7B8", "#8E9F83", "#59655A", "#2A342D"]],
    ["moss-stone", "Moss & Stone", ["#EFF1E8", "#252A24", "#718355", "#4F6040", "#A3B18A", "#7E8E6B", "#8C8C7A", "#66685E", "#DADBCF", "#A9ABA1", "#73766F", "#41443F"]],
    ["spring-garden", "Spring Garden", ["#F4FAE9", "#29452D", "#7BC950", "#4D9B3A", "#F4D35E", "#D0A928", "#F28C8C", "#CE5E73", "#BCE6A1", "#89C9A5", "#6D8C78", "#364C40"]],
    ["tropical", "Tropical", ["#E8FFF8", "#063F3A", "#00B894", "#00866F", "#00C2FF", "#0088B8", "#FFB703", "#E67E00", "#FF5A5F", "#D63049", "#7DD3C7", "#245B57"]],
    ["ocean", "Ocean", ["#E8F8FF", "#082C4C", "#0077B6", "#005582", "#00B4D8", "#0086A6", "#48CAE4", "#239DB8", "#90E0EF", "#5AB4C5", "#4E7189", "#243B53"]],
    ["coastal", "Coastal", ["#F2FBFA", "#173B45", "#4FA3A5", "#2D777A", "#79BCCA", "#4C91A3", "#E3B778", "#BB8951", "#CDE4DE", "#94AAA7", "#63777A", "#354B50"]],
    ["arctic-winter", "Arctic Winter", ["#F6FCFF", "#18324A", "#77C7E8", "#4598BC", "#BDE9F5", "#8DC8DA", "#9FA8DA", "#7079AC", "#E4F3F8", "#AFC2CC", "#718591", "#3C5361"]],
    ["cold-steel", "Cold Steel", ["#EEF3F6", "#1E2933", "#607D8B", "#405866", "#90A4AE", "#687F8B", "#5B6F8A", "#3E5069", "#CFD8DC", "#9AA8AF", "#69757C", "#39444A"]],
    ["cool-slate", "Cool Slate", ["#F1F3F5", "#212936", "#64748B", "#475569", "#94A3B8", "#718096", "#4F6D8A", "#38516B", "#D9DEE5", "#A8B0BD", "#6B7280", "#374151"]],
    ["night-sky", "Night Sky", ["#EAEAF8", "#090B1A", "#263A8A", "#16245F", "#5267C9", "#3448A4", "#8A63D2", "#62419C", "#B8B7E8", "#74759D", "#42445F", "#202238"]],
    ["lavender-dream", "Lavender Dream", ["#F8F1FF", "#392B4A", "#A77BD4", "#7B55A3", "#D1B3EA", "#AE86D0", "#F2A6C8", "#CF739E", "#E9D8F5", "#B7A6C3", "#7D6E88", "#493F52"]],
    ["royal-purple", "Royal Purple", ["#F4ECFF", "#2B1645", "#6F2DBD", "#4C1D87", "#9D4EDD", "#7230AB", "#C77DFF", "#9A55CE", "#DEC0F1", "#AA8DBD", "#725F82", "#3E334A"]],
    ["berry", "Berry", ["#FFF0F6", "#42152C", "#B83280", "#86205C", "#D95D9E", "#AC3976", "#8E44AD", "#672E86", "#F2B5D4", "#C282A3", "#805A70", "#493643"]],
    ["blush-rose", "Blush Rose", ["#FFF3F5", "#4B2931", "#E6879B", "#C45A75", "#F3B6C2", "#D9899B", "#C77D8C", "#9D5667", "#F8D8DE", "#C8A4AB", "#876B72", "#4E4044"]],
    ["candy", "Candy", ["#FFF1FA", "#43213B", "#FF5DA2", "#D9367F", "#7C5CFC", "#5940C8", "#30C5FF", "#1693C4", "#FFD166", "#F0A62E", "#A783A0", "#514052"]],
    ["pastel-rainbow", "Pastel Rainbow", ["#FFF5F5", "#474052", "#FFB3BA", "#E78E9B", "#FFDFBA", "#E7B67E", "#FFFFBA", "#D5D580", "#BAFFC9", "#82D99A", "#BAE1FF", "#8EB6D7"]],
    ["neon-sunrise", "Neon Sunrise", ["#FFF4CF", "#240046", "#FFBE0B", "#F57C00", "#FB5607", "#D83A00", "#FF006E", "#C90059", "#C94BFF", "#8B1FC2", "#8338EC", "#3A0CA3"]],
    ["acid", "Acid", ["#F7FFD6", "#182600", "#CCFF00", "#8EB800", "#7FFF00", "#48B800", "#00FF99", "#00B86B", "#E6FF4D", "#A6C72D", "#657A20", "#32400E"]],
    ["alkaline-aqua", "Alkaline Aqua", ["#E6FFFB", "#063B3A", "#00F5D4", "#00AF9A", "#00D9FF", "#0097B8", "#64FFDA", "#2CC7A9", "#B2F7EF", "#78BFB8", "#4C7C7A", "#254747"]],
    ["retro-arcade", "Retro Arcade", ["#F7E6FF", "#160F2D", "#FF00FF", "#B600B6", "#00FFFF", "#00A8A8", "#FFFF00", "#C2C200", "#FF3D00", "#C12A00", "#6C3EFF", "#3E238F"]],
    ["vintage-paper", "Vintage Paper", ["#F5ECD7", "#302B22", "#B08D57", "#7D633E", "#C9A66B", "#96794E", "#7F8C64", "#5C6948", "#D6C5A3", "#AA9B7E", "#746A58", "#454038"]],
    ["monochrome", "Monochrome", ["#FFFFFF", "#000000", "#E6E6E6", "#CCCCCC", "#B3B3B3", "#999999", "#808080", "#666666", "#4D4D4D", "#333333", "#1A1A1A", "#0D0D0D"]]
  ]);

  function normalizeHex(value) {
    const match = /^#?([0-9a-f]{6})$/i.exec(String(value || "").trim());
    return match ? `#${match[1].toUpperCase()}` : null;
  }

  const BUILT_IN_PALETTES = Object.freeze(BUILT_IN_PALETTE_DATA.map(([id, name, colors]) => Object.freeze({
    id, name, source: "built-in", colors: Object.freeze(colors.slice())
  })));
  const DEFAULT_PALETTE = Object.freeze({ id: "default", name: "Default", source: "default", colors: DEFAULT_PALETTE_COLORS });

  function previewColors(palette) {
    if (!palette) return DEFAULT_PALETTE_COLORS.slice(0, 12);
    const values = palette.source === "custom" ? palette.slots : palette.colors;
    return Array.from({ length: 12 }, (_, index) => normalizeHex(values?.[index]) || "#FFFFFF");
  }

  function toolbarColors(palette) {
    if (!palette || palette.id === "default") return DEFAULT_PALETTE_COLORS.slice();
    return previewColors(palette).concat(BASIC_COLORS);
  }

  function exportColors(palette) {
    if (!palette || palette.id === "default") return DEFAULT_PALETTE_COLORS.slice();
    if (palette.source === "custom") return (palette.slots || []).map(normalizeHex).filter(Boolean);
    return (palette.colors || []).map(normalizeHex).filter(Boolean);
  }

  return Object.freeze({
    DEFAULT_PALETTE_COLORS,
    BASIC_COLORS,
    DEFAULT_PALETTE,
    BUILT_IN_PALETTES,
    normalizeHex,
    previewColors,
    toolbarColors,
    exportColors
  });
});
