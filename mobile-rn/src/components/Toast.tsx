import { View, Text, TouchableOpacity, Animated } from 'react-native';
import { useEffect, useRef } from 'react';
import { X, AlertCircle, CheckCircle, Info } from 'lucide-react-native';
import { useToastStore, type Toast } from '../stores/toast-store';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function ToastItem({ toast }: { toast: Toast }) {
  const dismiss = useToastStore(s => s.dismiss);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 250, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 250, useNativeDriver: true }),
    ]).start();
  }, []);

  const bg = toast.type === 'error' ? '#fef2f2' : toast.type === 'success' ? '#f0fdf4' : '#f8fafc';
  const border = toast.type === 'error' ? '#fecaca' : toast.type === 'success' ? '#bbf7d0' : '#e2e8f0';
  const textColor = toast.type === 'error' ? '#b91c1c' : toast.type === 'success' ? '#15803d' : '#475569';
  const iconColor = toast.type === 'error' ? '#ef4444' : toast.type === 'success' ? '#22c55e' : '#64748b';
  const Icon = toast.type === 'error' ? AlertCircle : toast.type === 'success' ? CheckCircle : Info;

  return (
    <Animated.View
      style={{
        opacity,
        transform: [{ translateY }],
        backgroundColor: bg,
        borderWidth: 1,
        borderColor: border,
        borderRadius: 16,
        paddingHorizontal: 16,
        paddingVertical: 12,
        marginBottom: 8,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 4,
      }}
    >
      <Icon size={18} color={iconColor} />
      <Text style={{ flex: 1, fontSize: 13, color: textColor, fontWeight: '500' }} numberOfLines={2}>
        {toast.message}
      </Text>
      <TouchableOpacity onPress={() => dismiss(toast.id)} hitSlop={8}>
        <X size={16} color={textColor} />
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function ToastContainer() {
  const toasts = useToastStore(s => s.toasts);
  const insets = useSafeAreaInsets();

  if (toasts.length === 0) return null;

  return (
    <View
      style={{
        position: 'absolute',
        top: insets.top + 8,
        left: 16,
        right: 16,
        zIndex: 9999,
      }}
      pointerEvents="box-none"
    >
      {toasts.map(t => <ToastItem key={t.id} toast={t} />)}
    </View>
  );
}
