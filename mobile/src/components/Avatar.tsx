const colors = [
  'bg-emerald-500', 'bg-blue-500', 'bg-purple-500', 'bg-amber-500',
  'bg-rose-500', 'bg-cyan-500', 'bg-indigo-500', 'bg-teal-500',
];

export default function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  const colorIdx = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % colors.length;
  const sizeClass = size === 'sm' ? 'h-8 w-8 text-xs' : size === 'lg' ? 'h-16 w-16 text-xl' : 'h-11 w-11 text-sm';

  return (
    <div className={`${sizeClass} ${colors[colorIdx]} rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0`}>
      {initials || '?'}
    </div>
  );
}
