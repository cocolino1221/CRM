import { View, Text } from 'react-native';

const COLORS = [
  ['#0c4a6e', '#0e7490'],
  ['#7c3aed', '#6d28d9'],
  ['#0f766e', '#047857'],
  ['#b45309', '#a16207'],
  ['#be185d', '#9f1239'],
  ['#4338ca', '#3730a3'],
];

function hashName(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = name.charCodeAt(i) + ((h << 5) - h);
  }
  return Math.abs(h);
}

interface Props {
  name: string;
  size?: 'sm' | 'md' | 'lg';
}

export default function Avatar({ name, size = 'md' }: Props) {
  const parts = name.trim().split(/\s+/);
  const initials = parts.length >= 2
    ? `${parts[0][0]}${parts[1][0]}`.toUpperCase()
    : (parts[0]?.[0] || '?').toUpperCase();

  const pair = COLORS[hashName(name) % COLORS.length];
  const dim = size === 'sm' ? 32 : size === 'lg' ? 64 : 44;
  const fontSize = size === 'sm' ? 12 : size === 'lg' ? 24 : 16;

  return (
    <View
      style={{
        width: dim,
        height: dim,
        borderRadius: dim / 2,
        backgroundColor: pair[0],
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: '#fff', fontSize, fontWeight: '700' }}>
        {initials}
      </Text>
    </View>
  );
}
