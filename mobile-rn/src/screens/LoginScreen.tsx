import { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ActivityIndicator, Linking } from 'react-native';
import { MessageCircle, Shield, Sparkles, Eye, EyeOff, Chrome } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '../stores/auth-store';
import api from '../lib/api';
import { parseOAuthRedirectUrl } from '../lib/oauth-callback';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [localError, setLocalError] = useState('');
  const [isOAuthLoading, setIsOAuthLoading] = useState(false);
  const handledOAuthCodeRef = useRef<string | null>(null);
  // Held only here, for one attempt. A callback that arrives without a login
  // in progress is not ours.
  const pendingBindingRef = useRef<string | null>(null);
  const { login, loginWithOAuthCode, isLoading, error } = useAuthStore();
  const insets = useSafeAreaInsets();
  const displayError = localError || error;

  useEffect(() => {
    const handleRedirect = async (url: string) => {
      const parsed = parseOAuthRedirectUrl(url);
      if (!parsed) return;

      if (parsed.error) {
        setLocalError(decodeURIComponent(parsed.error));
        return;
      }

      if (!parsed.code) {
        setLocalError('Google sign-in did not return an auth code.');
        return;
      }

      if (handledOAuthCodeRef.current === parsed.code) return;
      handledOAuthCodeRef.current = parsed.code;

      setLocalError('');
      setIsOAuthLoading(true);
      try {
        const binding = pendingBindingRef.current;
        if (!binding) {
          // Nobody on this screen asked for this. An app that can open our
          // scheme could otherwise hand us a code from its own login.
          setLocalError('Autentificare neinițiată de aplicație. Încearcă din nou.');
          return;
        }
        pendingBindingRef.current = null;
        await loginWithOAuthCode(parsed.code, binding);
      } finally {
        setIsOAuthLoading(false);
      }
    };

    Linking.getInitialURL()
      .then((url) => {
        if (url) void handleRedirect(url);
      })
      .catch(() => {});

    const subscription = Linking.addEventListener('url', ({ url }) => {
      void handleRedirect(url);
    });

    return () => subscription.remove();
  }, [loginWithOAuthCode]);

  const handleSubmit = () => {
    if (!email.trim() || !password.trim()) return;
    setLocalError('');
    login(email.trim(), password);
  };

  const handleGoogleSignIn = async () => {
    setLocalError('');
    try {
      // Ask the server to start the login: it answers with the URL and the
      // secret that binds the eventual code to this app. Both can fail — no
      // network, server down — so neither sits outside this guard.
      const { data } = await api.post<{ authUrl: string; binding: string }>('/auth/oauth/start');
      if (!data?.authUrl || !data?.binding) {
        setLocalError('Nu s-a putut începe autentificarea. Încearcă din nou.');
        return;
      }
      pendingBindingRef.current = data.binding;
      await Linking.openURL(data.authUrl);
    } catch {
      // A half-started attempt must not leave a binding behind that a later
      // stray callback could use.
      pendingBindingRef.current = null;
      setLocalError('Nu s-a putut deschide autentificarea Google.');
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-slate-50"
    >
      <View className="flex-1 justify-center px-5" style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
        {/* Card */}
        <View className="bg-white/95 rounded-3xl p-6 shadow-lg border border-slate-100">
          {/* Logo */}
          <View className="mb-7">
            <View className="h-14 w-14 rounded-2xl bg-sky-800 items-center justify-center mb-4">
              <MessageCircle size={28} color="#fff" />
            </View>
            <Text className="text-3xl font-extrabold text-slate-900">easyTeamCRM</Text>
            <Text className="text-sm text-slate-500 mt-1">Sign in and pick up conversations instantly.</Text>
            <View className="flex-row gap-2 mt-3">
              <View className="flex-row items-center gap-1 bg-sky-50 px-2.5 py-1 rounded-full">
                <Shield size={12} color="#0369a1" />
                <Text className="text-[11px] font-semibold text-sky-700">Secure access</Text>
              </View>
              <View className="flex-row items-center gap-1 bg-teal-50 px-2.5 py-1 rounded-full">
                <Sparkles size={12} color="#0f766e" />
                <Text className="text-[11px] font-semibold text-teal-700">Fast onboarding</Text>
              </View>
            </View>
          </View>

          {/* Error */}
          {displayError && (
            <View className="bg-rose-50 border border-rose-100 rounded-xl px-4 py-3 mb-4">
              <Text className="text-sm text-rose-700">{displayError}</Text>
            </View>
          )}

          {/* Email */}
          <View className="mb-3.5">
            <Text className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Email</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="you@company.com"
              placeholderTextColor="#94a3b8"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-white text-base text-slate-900"
            />
          </View>

          {/* Password */}
          <View className="mb-4">
            <Text className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Password</Text>
            <View className="relative">
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="Enter password"
                placeholderTextColor="#94a3b8"
                secureTextEntry={!showPass}
                className="w-full px-4 py-3 pr-12 rounded-2xl border border-slate-200 bg-white text-base text-slate-900"
                onSubmitEditing={handleSubmit}
              />
              <TouchableOpacity
                onPress={() => setShowPass(!showPass)}
                className="absolute right-3 top-0 bottom-0 justify-center"
              >
                {showPass ? <EyeOff size={20} color="#94a3b8" /> : <Eye size={20} color="#94a3b8" />}
              </TouchableOpacity>
            </View>
          </View>

          {/* Submit */}
          <TouchableOpacity
            onPress={handleSubmit}
            disabled={isLoading || isOAuthLoading || !email.trim() || !password.trim()}
            className="w-full py-3.5 bg-sky-800 rounded-2xl items-center justify-center flex-row gap-2"
            style={{ opacity: isLoading || isOAuthLoading ? 0.5 : 1 }}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text className="text-white font-semibold text-base">Sign In</Text>
            )}
          </TouchableOpacity>

          <View className="flex-row items-center my-4">
            <View className="flex-1 h-px bg-slate-200" />
            <Text className="px-3 text-xs text-slate-400">or continue with</Text>
            <View className="flex-1 h-px bg-slate-200" />
          </View>

          <TouchableOpacity
            onPress={handleGoogleSignIn}
            disabled={isLoading || isOAuthLoading}
            className="w-full py-3.5 border border-slate-200 rounded-2xl items-center justify-center flex-row gap-2 bg-white"
            style={{ opacity: isLoading || isOAuthLoading ? 0.5 : 1 }}
          >
            {isOAuthLoading ? (
              <ActivityIndicator color="#0f172a" size="small" />
            ) : (
              <>
                <Chrome size={18} color="#0f172a" />
                <Text className="text-slate-900 font-semibold text-base">Google</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
