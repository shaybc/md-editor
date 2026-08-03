# Bundled draw.io Style Reference

Compact offline subset derived from the official `jgraph/drawio-mcp/shared/style-reference.md`.

## Core vertex styles

- Rectangle: `rounded=1;whiteSpace=wrap;html=1;`
- Actor: `shape=umlActor;verticalLabelPosition=bottom;verticalAlign=top;html=1;`
- Lifeline: `shape=umlLifeline;perimeter=lifelinePerimeter;size=30;html=1;`
- Activation: `rounded=0;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=#000000;`
- Note: `shape=note;whiteSpace=wrap;html=1;`
- Frame: `shape=umlFrame;whiteSpace=wrap;html=1;`
- Destroy: `shape=umlDestroy;html=1;`

## Edge styles

- Synchronous message: `html=1;endArrow=block;endFill=1;endSize=6;startSize=6;`
- Asynchronous message: `html=1;endArrow=open;endFill=0;endSize=6;startSize=6;`
- Return message: `html=1;dashed=1;endArrow=open;endFill=0;endSize=6;startSize=6;`
- Architecture/flow: `edgeStyle=orthogonalEdgeStyle;rounded=1;html=1;`

## Important properties

`fillColor`, `strokeColor`, `strokeWidth`, `dashed`, `fontSize`, `fontStyle`, `align`, `verticalAlign`, `labelBackgroundColor`, `startArrow`, `endArrow`, `startSize`, `endSize`, `startFill`, `endFill`, `opacity`.

Keep one visual meaning per style variation and avoid decorative styling that does not encode information.
