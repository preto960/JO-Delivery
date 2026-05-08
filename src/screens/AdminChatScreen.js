import React, {useState, useEffect, useRef, useCallback, useMemo} from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  SafeAreaView,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import {Ionicons} from 'react-native-vector-icons/Ionicons';
import {useAuth} from '@context/AuthContext';
import apiService from '@services/api';
import theme from '@theme/styles';
import useThemeColors from '@hooks/useThemeColors';

// ─── Helpers ───────────────────────────────────────────────────────────────

const formatTime = dateStr => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const h = date.getHours().toString().padStart(2, '0');
  const m = date.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
};

const formatDate = dateStr => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const d = date.getDate().toString().padStart(2, '0');
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  return `${d}/${m}`;
};

const POLL_INTERVAL = 5000;

// ─── Component ────────────────────────────────────────────────────────────

const AdminChatScreen = ({navigation}) => {
  const {user, token} = useAuth();
  const {primary} = useThemeColors();
  const styles = useMemo(() => createStyles(primary), [primary]);

  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const flatListRef = useRef(null);
  const pollTimerRef = useRef(null);
  const isMountedRef = useRef(true);
  const lastMsgCountRef = useRef(0);

  // ─── Fetch message history ─────────────────────────────────────────────

  const fetchMessages = useCallback(async (isBackground = false) => {
    if (!isMountedRef.current) return;
    try {
      if (!isBackground) setLoading(true);
      const res = await apiService.fetchAdminChatMessages();

      if (!isMountedRef.current) return;

      // Handle different response formats
      let msgs = [];
      if (res && res.messages) {
        msgs = res.messages;
      } else if (res && res.data && Array.isArray(res.data)) {
        msgs = res.data.map(m => ({
          id: String(m.id),
          content: m.content,
          senderId: String(m.senderId),
          senderName: m.sender?.name || 'Admin',
          senderRole: 'admin',
          createdAt: m.createdAt,
        }));
      } else if (Array.isArray(res)) {
        msgs = res;
      }

      setMessages(msgs);

      // Auto-scroll only if new messages were added
      if (msgs.length > lastMsgCountRef.current && flatListRef.current) {
        setTimeout(() => {
          flatListRef.current?.scrollToEnd({animated: true});
        }, 100);
      }
      lastMsgCountRef.current = msgs.length;
    } catch (err) {
      console.error('Error cargando mensajes admin:', err);
    } finally {
      if (isMountedRef.current && !isBackground) setLoading(false);
    }
  }, []);

  // ─── Initial load ──────────────────────────────────────────────────────

  useEffect(() => {
    isMountedRef.current = true;
    fetchMessages(false);

    // Start polling for new messages
    pollTimerRef.current = setInterval(() => {
      fetchMessages(true);
    }, POLL_INTERVAL);

    return () => {
      isMountedRef.current = false;
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [fetchMessages]);

  // ─── Pull to refresh ──────────────────────────────────────────────────

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchMessages(false);
    setRefreshing(false);
  }, [fetchMessages]);

  // ─── Send message ─────────────────────────────────────────────────────

  const sendMessage = async () => {
    if (!inputText.trim() || sending) return;
    const content = inputText.trim();
    setInputText('');
    setSending(true);
    try {
      await apiService.sendAdminChatMessage(content);
      // Immediately refresh to show the sent message
      await fetchMessages(true);
    } catch (err) {
      console.error('Error enviando mensaje admin:', err);
      setInputText(content);
    } finally {
      setSending(false);
    }
  };

  // ─── Header setup ─────────────────────────────────────────────────────

  useEffect(() => {
    navigation.setOptions({
      headerShown: true,
      title: '',
      headerStyle: {
        backgroundColor: theme.colors.white,
        ...theme.shadows.sm,
      },
      headerLeft: () => (
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{top: 8, bottom: 8, left: 4, right: 4}}
          style={styles.headerBackBtn}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>
      ),
      headerTitle: () => (
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Chat Admin</Text>
          <View style={styles.statusRow}>
            <View style={styles.statusDotOnline} />
            <Text style={styles.headerSubtitle}>Sincronizando</Text>
          </View>
        </View>
      ),
      headerRight: () => <View style={{width: 40}} />,
    });
  }, [navigation, styles]);

  // ─── Render: Message Bubble ───────────────────────────────────────────

  const renderMessage = useCallback(
    ({item, index}) => {
      const senderId = String(item.senderId);
      const userId = user ? String(user.id) : '';
      const isSender = senderId === userId;
      const prevMessage = index > 0 ? messages[index - 1] : null;
      const showDate =
        !prevMessage ||
        formatDate(item.createdAt) !== formatDate(prevMessage.createdAt);

      return (
        <View>
          {showDate && (
            <View style={styles.dateSeparator}>
              <Text style={styles.dateText}>{formatDate(item.createdAt)}</Text>
            </View>
          )}
          <View
            style={[
              styles.messageRow,
              isSender ? styles.messageRowSender : styles.messageRowReceiver,
            ]}>
            <View
              style={[
                styles.bubble,
                isSender ? styles.bubbleSender : styles.bubbleReceiver,
              ]}>
              <Text
                style={[
                  styles.bubbleText,
                  isSender ? styles.bubbleTextSender : styles.bubbleTextReceiver,
                ]}>
                {item.content}
              </Text>
              <View
                style={[
                  styles.bubbleFooter,
                  isSender
                    ? styles.bubbleFooterSender
                    : styles.bubbleFooterReceiver,
                ]}>
                {!isSender && item.senderName && (
                  <Text style={styles.senderName}>{item.senderName}</Text>
                )}
                {item.senderRole && (
                  <Text style={styles.senderRole}>{item.senderRole}</Text>
                )}
                <Text
                  style={[
                    styles.timeText,
                    isSender
                      ? styles.timeTextSender
                      : styles.timeTextReceiver,
                  ]}>
                  {formatTime(item.createdAt)}
                </Text>
              </View>
            </View>
          </View>
        </View>
      );
    },
    [messages, styles, user],
  );

  // ─── Key extractor ────────────────────────────────────────────────────

  const keyExtractor = useCallback(item => String(item.id), []);

  // ─── Empty state ──────────────────────────────────────────────────────

  const renderEmpty = useCallback(() => {
    if (loading) return null;
    return (
      <View style={styles.emptyContainer}>
        <Ionicons
          name="chatbubbles-outline"
          size={56}
          color={theme.colors.textLight}
        />
        <Text style={styles.emptyTitle}>Sin mensajes</Text>
        <Text style={styles.emptyText}>
          Inicia una conversacion con el equipo de administradores.
        </Text>
      </View>
    );
  }, [loading, styles]);

  // ─── Loading state ────────────────────────────────────────────────────

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color={primary} />
          <Text style={styles.loaderText}>Cargando mensajes...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ─── Main Render ──────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}>
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={keyExtractor}
          renderItem={renderMessage}
          ListEmptyComponent={renderEmpty}
          contentContainerStyle={
            messages.length === 0
              ? styles.emptyList
              : styles.messagesList
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[primary]}
              tintColor={primary}
            />
          }
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="on-drag"
          inverted={false}
        />

        {/* Input Bar */}
        <View style={styles.inputBar}>
          <View style={styles.inputWrapper}>
            <TextInput
              style={styles.textInput}
              value={inputText}
              onChangeText={setInputText}
              placeholder="Escribe un mensaje..."
              placeholderTextColor={theme.colors.textLight}
              multiline
              maxLength={500}
              editable={!sending}
            />
            <TouchableOpacity
              style={[
                styles.sendButton,
                (!inputText.trim() || sending) && styles.sendButtonDisabled,
              ]}
              onPress={sendMessage}
              disabled={!inputText.trim() || sending}
              activeOpacity={0.7}>
              {sending ? (
                <ActivityIndicator size="small" color={theme.colors.white} />
              ) : (
                <Ionicons name="send" size={20} color={theme.colors.white} />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────

const createStyles = primary =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },

    // Header
    headerBackBtn: {
      marginLeft: theme.spacing.sm,
      padding: theme.spacing.xs,
    },
    headerCenter: {
      alignItems: 'center',
    },
    headerTitle: {
      fontSize: theme.fontSize.lg,
      fontWeight: '700',
      color: theme.colors.text,
    },
    statusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginTop: 1,
    },
    statusDotOnline: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: '#22C55E',
    },
    headerSubtitle: {
      fontSize: theme.fontSize.xs,
      color: theme.colors.textSecondary,
    },

    // Loader
    loaderContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.background,
    },
    loaderText: {
      marginTop: theme.spacing.md,
      fontSize: theme.fontSize.md,
      color: theme.colors.textSecondary,
    },

    // Messages list
    messagesList: {
      paddingHorizontal: theme.spacing.md,
      paddingTop: theme.spacing.sm,
      paddingBottom: theme.spacing.sm,
    },
    emptyList: {
      flexGrow: 1,
      backgroundColor: theme.colors.background,
    },

    // Empty state
    emptyContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: theme.spacing.xl,
      paddingVertical: theme.spacing.xxl,
    },
    emptyTitle: {
      fontSize: theme.fontSize.lg,
      fontWeight: '600',
      color: theme.colors.text,
      marginTop: theme.spacing.md,
    },
    emptyText: {
      fontSize: theme.fontSize.md,
      color: theme.colors.textSecondary,
      textAlign: 'center',
      marginTop: theme.spacing.xs,
      lineHeight: 22,
    },

    // Date separator
    dateSeparator: {
      alignItems: 'center',
      marginVertical: theme.spacing.md,
    },
    dateText: {
      fontSize: theme.fontSize.xs,
      color: theme.colors.textLight,
      backgroundColor: theme.colors.inputBg,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.xs,
      borderRadius: theme.borderRadius.full,
      overflow: 'hidden',
    },

    // Message rows
    messageRow: {
      marginBottom: theme.spacing.xs,
      maxWidth: '85%',
    },
    messageRowSender: {
      alignSelf: 'flex-end',
    },
    messageRowReceiver: {
      alignSelf: 'flex-start',
    },

    // Bubbles
    bubble: {
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
      borderRadius: theme.borderRadius.lg,
    },
    bubbleSender: {
      backgroundColor: primary,
      borderBottomRightRadius: theme.borderRadius.xs,
    },
    bubbleReceiver: {
      backgroundColor: theme.colors.white,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderBottomLeftRadius: theme.borderRadius.xs,
    },

    // Bubble text
    bubbleText: {
      fontSize: theme.fontSize.md,
      lineHeight: 20,
    },
    bubbleTextSender: {
      color: theme.colors.white,
    },
    bubbleTextReceiver: {
      color: theme.colors.text,
    },

    // Bubble footer (sender name + role + time)
    bubbleFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 4,
      gap: 4,
    },
    bubbleFooterSender: {
      justifyContent: 'flex-end',
    },
    bubbleFooterReceiver: {
      justifyContent: 'flex-start',
    },
    senderName: {
      fontSize: theme.fontSize.xs,
      fontWeight: '600',
      color: theme.colors.textSecondary,
    },
    senderRole: {
      fontSize: 10,
      color: theme.colors.textLight,
      fontStyle: 'italic',
    },
    timeText: {
      fontSize: 10,
    },
    timeTextSender: {
      color: 'rgba(255,255,255,0.7)',
    },
    timeTextReceiver: {
      color: theme.colors.textLight,
    },

    // Input bar
    inputBar: {
      backgroundColor: theme.colors.white,
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
      paddingBottom: Platform.OS === 'ios' ? theme.spacing.md : theme.spacing.sm,
    },
    inputWrapper: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: theme.spacing.sm,
      backgroundColor: theme.colors.inputBg,
      borderRadius: theme.borderRadius.lg,
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: theme.spacing.xs,
    },
    textInput: {
      flex: 1,
      fontSize: theme.fontSize.md,
      color: theme.colors.text,
      maxHeight: 100,
      paddingVertical: theme.spacing.xs,
      paddingHorizontal: theme.spacing.xs,
    },
    sendButton: {
      width: 36,
      height: 36,
      borderRadius: theme.borderRadius.full,
      backgroundColor: primary,
      alignItems: 'center',
      justifyContent: 'center',
      ...theme.shadows.sm,
    },
    sendButtonDisabled: {
      backgroundColor: theme.colors.textLight,
      opacity: 0.6,
    },
  });

export default AdminChatScreen;
