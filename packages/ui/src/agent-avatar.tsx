export interface AgentAvatarProps {
  id: string;
  unread?: boolean;
}

const colors = [
  "#000000",
  "#a27952",
  "#ff3e51",
  "#ff781c",
  "#ffaf38",
  "#00c972",
  "#1cc3b0",
  "#2a92fe",
  "#a97efe",
  "#ff5eb1",
] as const;

const shapes = [
  "M18 2.5C27.2 2.5 34 8.7 34 17.8c0 9.4-6.3 15.7-15.9 15.7C8.6 33.5 2 27.2 2 18 2 8.7 8.5 2.5 18 2.5Z",
  "M18 3C28.6 3 33.5 8.3 33.5 18S28.6 33 18 33 2.5 27.7 2.5 18 7.4 3 18 3Z",
  "M10.2 2.5h15.6c5 0 7.7 2.7 7.7 7.7v15.6c0 5-2.7 7.7-7.7 7.7H10.2c-5 0-7.7-2.7-7.7-7.7V10.2c0-5 2.7-7.7 7.7-7.7Z",
  "M12.5 2.5h11c6.5 0 10 5.1 10 15.5s-3.5 15.5-10 15.5h-11C6 33.5 2.5 28.4 2.5 18S6 2.5 12.5 2.5Z",
  "M5.2 7.4C7.4 3.9 11 2.5 16.7 2.5h11.1c3.7 0 5.7 2 5.7 5.7v19.6c0 3.7-2 5.7-5.7 5.7H8.2c-3.7 0-5.7-2-5.7-5.7V13.4c0-2.2.9-4.2 2.7-6Z",
  "M10.2 3.2h15.6L33.6 18l-7.8 14.8H10.2L2.4 18l7.8-14.8Z",
  "M9.7 32.8A7.2 7.2 0 0 1 4 21.2 8.4 8.4 0 0 1 9.6 7.1 10.5 10.5 0 0 1 28.8 12a10.8 10.8 0 0 1-3 20.8H9.7Z",
  "M18 2.2c2.7 5.3 12.8 12.4 12.8 20.1A12.7 12.7 0 0 1 18 34.8 12.7 12.7 0 0 1 5.2 22.3C5.2 14.6 15.3 7.5 18 2.2Z",
] as const;

export function AgentAvatar({ id, unread = false }: AgentAvatarProps) {
  const color = colors[colorIndex(id)] ?? colors[0];
  const shape = shapes[shapeIndex(id)] ?? shapes[0];

  return (
    <span aria-hidden="true" className="avatar" data-avatar-key={id}>
      <svg className="agent-avatar-mark" viewBox="0 0 36 36">
        <path d={shape} fill={color} />
        <g className="agent-avatar-face" fill="#f7f7f7">
          <rect
            height="7.5"
            rx="2.15"
            transform="rotate(-14 12.6 16.3)"
            width="4.3"
            x="10.45"
            y="12.55"
          />
          <rect
            height="7.5"
            rx="2.15"
            transform="rotate(-14 23.3 16.3)"
            width="4.3"
            x="21.15"
            y="12.55"
          />
        </g>
      </svg>
      {unread ? <i /> : null}
    </span>
  );
}

function colorIndex(value: string): number {
  const seed = (fnv1a(value) ^ Math.imul(1, 2_654_435_769)) >>> 0;
  const random = mulberry32((seed ^ Math.imul(1, 2_654_435_769)) >>> 0);
  return Math.floor(random() * colors.length);
}

function shapeIndex(value: string): number {
  let hash = fnv1a(value);
  hash = Math.imul(hash ^ (hash >>> 16), 73_244_475);
  hash = Math.imul(hash ^ (hash >>> 13), 3_266_489_909);
  return ((hash ^ (hash >>> 16)) >>> 0) % shapes.length;
}

function fnv1a(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  return () => {
    seed = (seed + 1_831_565_813) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}
