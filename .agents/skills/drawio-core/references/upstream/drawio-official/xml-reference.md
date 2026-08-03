# Bundled draw.io XML Compatibility Reference

Source of truth: official `jgraph/drawio-mcp/shared/xml-reference.md`.
This local compact snapshot contains the rules required by these skills so normal generation works offline.

## Minimal file

```xml
<mxfile host="app.diagrams.net" modified="2026-01-01T00:00:00.000Z" agent="Codex" version="24.7.17" type="device" compressed="false">
  <diagram id="page-1" name="Page-1">
    <mxGraphModel dx="0" dy="0" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1169" pageHeight="827" math="0" shadow="0">
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
```

## Mandatory rules

- Use uncompressed XML.
- Root cells `0` and `1` are mandatory.
- IDs must be unique.
- Vertices use `vertex="1"`; edges use `edge="1"`.
- Every edge must contain `<mxGeometry relative="1" as="geometry"/>`.
- Child coordinates are relative to their parent container.
- XML-escape HTML labels.
- Use `html=1` when labels contain HTML.
- Prefer automatic edge routing; add waypoints only with explicit geometric intent.

## Common cells

```xml
<mxCell id="node" value="Label" style="rounded=1;whiteSpace=wrap;html=1;" vertex="1" parent="1">
  <mxGeometry x="100" y="100" width="160" height="70" as="geometry"/>
</mxCell>
```

```xml
<mxCell id="edge" value="call" style="html=1;endArrow=block;endFill=1;" edge="1" source="a" target="b" parent="1">
  <mxGeometry relative="1" as="geometry"/>
</mxCell>
```

## UML sequence primitives

- Lifeline style: `shape=umlLifeline;perimeter=lifelinePerimeter;size=30;html=1;`.
- Sequence messages normally use straight connectors, small arrowheads, and explicit geometry points at the same y-coordinate.
- Return messages use `dashed=1`.
- Destruction uses `shape=umlDestroy` or a clear X marker.
- Frames use `shape=umlFrame` or a labeled container rectangle.
