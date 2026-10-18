const colors = [
  'bg-gradient-to-br from-sky-600 to-sky-500',
  'bg-gradient-to-br from-teal-600 to-teal-500',
  'bg-gradient-to-br from-indigo-600 to-indigo-500',
  'bg-gradient-to-br from-amber-500 to-orange-500',
  'bg-gradient-to-br from-rose-500 to-red-500',
  'bg-gradient-to-br from-cyan-600 to-cyan-500',
];

export default function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  const colorIdx = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % colors.length;
  const sizeClass = size === 'sm' ? 'h-8 w-8 text-xs' : size === 'lg' ? 'h-16 w-16 text-xl' : 'h-11 w-11 text-sm';

  return (
    <div className={`${sizeClass} ${colors[colorIdx]} rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0 shadow-sm ring-2 ring-white/75`}>
      {initials || '?'}
    </div>
  );
}
