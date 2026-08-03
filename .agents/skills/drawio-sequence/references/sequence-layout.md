# Deterministic Sequence Layout

## Coordinates

- Top margin: 40 px.
- Participant header y: 40 px.
- Header height: 50 px.
- First lifeline center x: 120 px.
- Participant center spacing: 220 px.
- First message y: 130 px.
- Message row height: 52 px.
- Fragment label/divider rows: reserve 32 px each.
- Bottom margin: 60 px.

## Participant ordering heuristic

1. Initiator leftmost.
2. Traverse messages in order.
3. When a participant first appears, place it immediately right of its first caller unless already positioned.
4. For participants called by several peers, choose the median caller position.
5. Put durable stores and external providers near their primary owner rather than automatically at the far right.
6. Keep UI/client actors left of services unless the requested notation says otherwise.

## Vertical allocation

Build rows before XML:

- normal message: 1 row;
- self-call: 2 rows;
- fragment opening: 0.6 row;
- operand divider: 0.6 row;
- note: max(1 row, note height / row height);
- creation/destruction: 1 row.

Never squeeze rows after allocation. Increase canvas height instead.

## Label placement

- Center labels above message lines with 6–8 px clearance.
- Keep labels inside the horizontal span of sender and receiver.
- For adjacent participants, wrap labels over 26 characters or increase spacing.
- Use a white label background only when a line passes behind text.

## Self-call geometry

- Loop width: 38 px.
- Loop height: 34 px.
- Place on the right of the activation/lifeline unless that would collide with the next participant; then use the left side.
