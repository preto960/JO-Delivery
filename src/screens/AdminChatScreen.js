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
import Ionicons from 'react-native-vector-icons/Ionicons';
import {useAuth} from '@context/AuthContext';
import apiService from '@services/api';
import {getPusherClient} from '@services/pusher';
import theme from '@theme/styles';
import useThemeColors from '@hooks/useThemeColors';

// ─── Config ──────────────────────────────────────────────────────────────
const THIS_PLATFORM = 'app-delivery';

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

const getInitials = name => {
  if (!name) return 'A';
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
};

// ─── Component ────────────────────────────────────────────────────────────

const AdminChatScreen = ({navigation}) => {
  const {user, token} = useAuth();
  const {primary} = useThemeColors();
  const styles = useMemo(() => createStyles(primary), [primary]);

  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [onlineMembers, setOnlineMembers] = useState([]);
  const [pusherConnected, setPusherConnected] = useState(false);
  const [selectedMember, setSelectedMember] = useState(null);

  const flatListRef = useRef(null);
  const isMountedRef = useRef(true);
  const pusherRef = useRef(null);
  const channelRef = useRef(null);
  const inputRef = useRef(null);

  const myUserId = user ? String(user.id) : '';

  // ─── Fetch messages for selected member ────────────────────────────────

  const fetchMessages = useCallback(
    async (isBackground = false) => {
      if (!isMountedRef.current || !selectedMember) return;
      try {
        if (!isBackground) setLoading(true);
        const recipientId = parseInt(selectedMember.id.split('-')[0]);
        const res = await apiService.fetchAdminChatMessages(recipientId);

        if (!isMountedRef.current) return;

        let msgs = [];
        if (res && res.data && Array.isArray(res.data)) {
          msgs = res.data.map(m => ({
            id: String(m.id),
            content: m.content,
            senderId: String(m.senderId),
            senderName: m.sender?.name || 'Admin',
            platform: m.platform || 'unknown',
            createdAt: m.createdAt,
          }));
        } else if (res && res.messages) {
          msgs = res.messages;
        }

        setMessages(msgs);

        if (msgs.length > 0 && flatListRef.current) {
          setTimeout(() => {
            flatListRef.current?.scrollToEnd({animated: true});
          }, 100);
        }
      } catch (err) {
        console.error('Error cargando mensajes admin:', err);
      } finally {
        if (isMountedRef.current && !isBackground) setLoading(false);
      }
    },
    [selectedMember],
  );

  // ─── Pusher: presence + real-time messages ────────────────────────────

  useEffect(() => {
    if (!token) return;

    let pusher = null;
    let channel = null;

    try {
      pusher = getPusherClient(token);
      pusherRef.current = pusher;

      pusher.connection.bind('connected', () => {
        if (isMountedRef.current) setPusherConnected(true);
      });
      pusher.connection.bind('disconnected', () => {
        if (isMountedRef.current) setPusherConnected(false);
      });
      if (pusher.connection.state === 'connected') {
        setPusherConnected(true);
      }

      channel = pusher.subscribe('presence-admin-chat');
      channelRef.current = channel;

      channel.bind('pusher:subscription_succeeded', members => {
        if (!isMountedRef.current) return;
        const list = [];
        members.each(m => {
          list.push({
            id: m.id,
            name: m.info?.name,
            platform: m.info?.platform,
          });
        });
        // Only show admins from OTHER platforms (filter by platform only)
        const filtered = list.filter(m => m.platform !== THIS_PLATFORM);
        setOnlineMembers(filtered);
      });

      channel.bind('pusher:member_added', member => {
        if (!isMountedRef.current) return;
        if (member.info?.platform === THIS_PLATFORM) return;
        setOnlineMembers(prev => [
          ...prev,
          {
            id: member.id,
            name: member.info?.name,
            platform: member.info?.platform,
          },
        ]);
      });

      channel.bind('pusher:member_removed', member => {
        if (!isMountedRef.current) return;
        setOnlineMembers(prev => prev.filter(m => m.id !== member.id));
      });

      // Real-time new-message event
      channel.bind('new-message', data => {
        if (!isMountedRef.current || !selectedMember) return;

        const senderId = String(data.senderId);
        const recipientId = data.recipientId
          ? String(data.recipientId)
          : null;
        const selectedNumericId = selectedMember.id.split('-')[0];

        const isForThisChat =
          (senderId === selectedNumericId &&
            recipientId === myUserId) ||
          (senderId === myUserId &&
            recipientId === selectedNumericId);

        if (isForThisChat) {
          setMessages(prev => {
            if (prev.some(m => m.id === String(data.id))) return prev;
            return [
              ...prev,
              {
                id: String(data.id),
                content: data.content,
                senderId,
                senderName: data.senderName || 'Admin',
                platform: data.senderPlatform || 'unknown',
                createdAt: data.createdAt,
              },
            ];
          });
        }
      });

      channel.bind('pusher:subscription_error', err => {
        console.warn('[AdminChat] Subscription error:', err);
      });
    } catch (err) {
      console.error('[AdminChat] Pusher init error:', err);
    }

    return () => {
      if (channel) {
        channel.unbind('pusher:subscription_succeeded');
        channel.unbind('pusher:member_added');
        channel.unbind('pusher:member_removed');
        channel.unbind('new-message');
        channel.unbind('pusher:subscription_error');
        try {
          pusher.unsubscribe('presence-admin-chat');
        } catch {}
      }
      pusherRef.current = null;
      channelRef.current = null;
    };
  }, [token, selectedMember, myUserId]);

  // ─── Load messages when member selected ────────────────────────────────

  useEffect(() => {
    isMountedRef.current = true;
    if (selectedMember) {
      setMessages([]);
      fetchMessages(false);
    }
    return () => {
      isMountedRef.current = false;
    };
  }, [selectedMember, fetchMessages]);

  // ─── Select / deselect member ──────────────────────────────────────────

  const selectMember = useCallback(member => {
    setSelectedMember(member);
    setMessages([]);
    setInputText('');
  }, []);

  const deselectMember = useCallback(() => {
    setSelectedMember(null);
    setMessages([]);
    setInputText('');
  }, []);

  // ─── Pull to refresh ──────────────────────────────────────────────────

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchMessages(false);
    setRefreshing(false);
  }, [fetchMessages]);

  // ─── Send message ─────────────────────────────────────────────────────

  const sendMessage = async () => {
    if (!inputText.trim() || sending || !selectedMember) return;
    const content = inputText.trim();
    setInputText('');
    setSending(true);
    try {
      const recipientId = parseInt(selectedMember.id.split('-')[0]);
      await apiService.sendAdminChatMessage(
        content,
        recipientId,
        selectedMember.platform || 'all',
      );
    } catch (err) {
      console.error('Error enviando mensaje admin:', err);
      setInputText(content);
    } finally {
      setSending(false);
      if (inputRef.current) inputRef.current.focus();
    }
  };

  // ─── Platform helpers ─────────────────────────────────────────────────

  const getPlatformLabel = platform => {
    if (platform === 'landingpage') return 'Landingpage';
    if (platform === 'frontend-shop') return 'Web Admin';
    if (platform === 'app-shop') return 'App Shop';
    if (platform === 'app-delivery') return 'App Delivery';
    return 'Otro';
  };

  const getPlatformIcon = platform => {
    if (platform === 'landingpage') return 'globe-outline';
    if (platform === 'frontend-shop') return 'desktop-outline';
    if (platform === 'app-delivery') return 'bicycle-outline';
    return 'phone-portrait-outline';
  };

  const getPlatformColor = platform => {
    if (platform === 'landingpage') return '#C9A84C';
    if (platform === 'frontend-shop') return '#3b82f6';
    if (platform === 'app-shop') return '#22c55e';
    if (platform === 'app-delivery') return '#f97316';
    return primary;
  };

  // ─── Render: Online member item (clickable) ────────────────────────────

  const renderMember = useCallback(
    ({item}) => {
      const pColor = getPlatformColor(item.platform);
      return (
        <TouchableOpacity
          style={styles.memberItem}
          onPress={() => selectMember(item)}
          activeOpacity={0.6}>
          <View style={[styles.memberAvatar, {backgroundColor: pColor + '20'}]}>
            <Text style={[styles.memberAvatarText, {color: pColor}]}>
              {getInitials(item.name)}
            </Text>
            <View style={styles.memberOnlineDot} />
          </View>
          <View style={styles.memberInfo}>
            <Text style={styles.memberName} numberOfLines={1}>
              {item.name || 'Admin'}
            </Text>
            <View style={styles.memberPlatformRow}>
              <Ionicons
                name={getPlatformIcon(item.platform)}
                size={11}
                color={theme.colors.textLight}
              />
              <Text style={styles.memberPlatform}>
                {getPlatformLabel(item.platform)}
              </Text>
            </View>
          </View>
          <Ionicons
            name="chevron-forward"
            size={16}
            color={theme.colors.textLight}
          />
        </TouchableOpacity>
      );
    },
    [styles, selectMember],
  );

  // ─── Render: Online members list (when no member selected) ─────────────

  const renderMembersList = () => (
    <View style={styles.membersListContainer}>
      <View style={styles.membersListHeader}>
        <View style={styles.membersListHeaderLeft}>
          <Ionicons
            name="people-outline"
            size={18}
            color={primary}
          />
          <Text style={styles.membersListTitle}>
            Administradores en linea
          </Text>
        </View>
        <View style={styles.membersCountBadge}>
          <Text style={styles.membersCountText}>{onlineMembers.length}</Text>
        </View>
      </View>

      {onlineMembers.length === 0 ? (
        <View style={styles.membersEmpty}>
          <Ionicons
            name="chatbubbles-outline"
            size={48}
            color={theme.colors.textLight}
          />
          <Text style={styles.membersEmptyTitle}>
            Sin administradores conectados
          </Text>
          <Text style={styles.membersEmptyText}>
            Los administradores desde otras plataformas apareceran aqui cuando se conecten
          </Text>
        </View>
      ) : (
        <FlatList
          data={onlineMembers}
          keyExtractor={item => item.id}
          renderItem={renderMember}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.membersListContent}
        />
      )}
    </View>
  );

  // ─── Render: Message bubble ────────────────────────────────────────────

  const renderMessage = useCallback(
    ({item, index}) => {
      const senderId = String(item.senderId);
      const isMine = senderId === myUserId && item.platform === THIS_PLATFORM;
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
              isMine ? styles.messageRowSender : styles.messageRowReceiver,
            ]}>
            <View
              style={[
                styles.bubble,
                isMine ? styles.bubbleSender : styles.bubbleReceiver,
              ]}>
              <Text
                style={[
                  styles.bubbleText,
                  isMine ? styles.bubbleTextSender : styles.bubbleTextReceiver,
                ]}>
                {item.content}
              </Text>
              <View
                style={[
                  styles.bubbleFooter,
                  isMine
                    ? styles.bubbleFooterSender
                    : styles.bubbleFooterReceiver,
                ]}>
                {!isMine && item.senderName && (
                  <Text style={styles.senderName}>{item.senderName}</Text>
                )}
                <Text
                  style={[
                    styles.timeText,
                    isMine ? styles.timeTextSender : styles.timeTextReceiver,
                  ]}>
                  {formatTime(item.createdAt)}
                </Text>
              </View>
            </View>
          </View>
        </View>
      );
    },
    [messages, styles, myUserId],
  );

  const keyExtractor = useCallback(item => String(item.id), []);

  // ─── Render: Empty state for chat ──────────────────────────────────────

  const renderChatEmpty = useCallback(() => {
    if (loading) {
      return (
        <View style={styles.chatEmptyContainer}>
          <ActivityIndicator size="large" color={primary} />
          <Text style={styles.chatEmptyText}>Cargando mensajes...</Text>
        </View>
      );
    }
    return (
      <View style={styles.chatEmptyContainer}>
        <Ionicons
          name="chatbubbles-outline"
          size={48}
          color={theme.colors.textLight}
        />
        <Text style={styles.chatEmptyTitle}>Inicia la conversacion</Text>
      </View>
    );
  }, [loading, styles, primary]);

  // ─── Render: Chat view (when member selected) ─────────────────────────

  const renderChatView = () => (
    <KeyboardAvoidingView
      style={styles.chatContainer}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}>
      {/* Chat header with selected member info */}
      <View style={styles.chatHeader}>
        <TouchableOpacity
          onPress={deselectMember}
          hitSlop={{top: 8, bottom: 8, left: 4, right: 4}}
          style={styles.chatHeaderBack}>
          <Ionicons name="arrow-back" size={22} color={theme.colors.text} />
        </TouchableOpacity>
        <View style={styles.memberAvatarSmall}>
          <Text
            style={[
              styles.memberAvatarTextSmall,
              {color: getPlatformColor(selectedMember.platform)},
            ]}>
            {getInitials(selectedMember.name)}
          </Text>
          <View style={styles.memberOnlineDotSmall} />
        </View>
        <View style={styles.chatHeaderInfo}>
          <Text style={styles.chatHeaderName} numberOfLines={1}>
            {selectedMember.name || 'Admin'}
          </Text>
          <Text
            style={[
              styles.chatHeaderPlatform,
              {color: getPlatformColor(selectedMember.platform)},
            ]}>
            {getPlatformLabel(selectedMember.platform)} · En linea
          </Text>
        </View>
      </View>

      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={keyExtractor}
        renderItem={renderMessage}
        ListEmptyComponent={renderChatEmpty}
        contentContainerStyle={
          messages.length === 0 ? styles.chatEmptyList : styles.messagesList
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
      />

      {/* Input bar */}
      <View style={styles.inputBar}>
        <View style={styles.inputWrapper}>
          <TextInput
            ref={inputRef}
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
  );

  // ─── Main Render ──────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {/* Header */}
      {!selectedMember ? (
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              hitSlop={{top: 8, bottom: 8, left: 4, right: 4}}>
              <Ionicons
                name="arrow-back"
                size={24}
                color={theme.colors.text}
              />
            </TouchableOpacity>
          </View>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Chat Admin</Text>
            <View style={styles.statusRow}>
              <View
                style={[
                  styles.statusDot,
                  {
                    backgroundColor: pusherConnected
                      ? '#22C55E'
                      : '#EF4444',
                  },
                ]}
              />
              <Text style={styles.headerSubtitle}>
                {pusherConnected ? 'En linea' : 'Desconectado'}
              </Text>
              {onlineMembers.length > 0 && (
                <Text style={styles.headerOnlineCount}>
                  {' '}
                  · {onlineMembers.length} en linea
                </Text>
              )}
            </View>
          </View>
          <View style={styles.headerRight} />
        </View>
      ) : null}

      {/* Content */}
      {selectedMember ? renderChatView() : renderMembersList()}
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
    chatContainer: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },

    // Header (no member selected)
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.colors.white,
      paddingHorizontal: theme.spacing.md,
      paddingTop: theme.spacing.sm,
      paddingBottom: theme.spacing.md,
      ...theme.shadows.sm,
    },
    headerLeft: {
      width: 40,
    },
    headerCenter: {
      flex: 1,
      alignItems: 'center',
    },
    headerRight: {
      width: 40,
      alignItems: 'flex-end',
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
    statusDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
    },
    headerSubtitle: {
      fontSize: theme.fontSize.xs,
      color: theme.colors.textSecondary,
    },
    headerOnlineCount: {
      fontSize: theme.fontSize.xs,
      color: theme.colors.textLight,
    },

    // Chat header (member selected)
    chatHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.colors.white,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
      ...theme.shadows.sm,
    },
    chatHeaderBack: {
      width: 32,
    },
    memberAvatarSmall: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: primary + '15',
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: theme.spacing.sm,
    },
    memberAvatarTextSmall: {
      fontSize: 11,
      fontWeight: '700',
    },
    memberOnlineDotSmall: {
      position: 'absolute',
      bottom: -1,
      right: -1,
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: '#22C55E',
      borderWidth: 2,
      borderColor: theme.colors.white,
    },
    chatHeaderInfo: {
      flex: 1,
      marginLeft: theme.spacing.sm,
    },
    chatHeaderName: {
      fontSize: theme.fontSize.md,
      fontWeight: '600',
      color: theme.colors.text,
    },
    chatHeaderPlatform: {
      fontSize: 11,
      fontWeight: '600',
      marginTop: 1,
    },

    // Online members list container
    membersListContainer: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    membersListHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
      backgroundColor: theme.colors.white,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    membersListHeaderLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.sm,
    },
    membersListTitle: {
      fontSize: theme.fontSize.sm,
      fontWeight: '700',
      color: theme.colors.text,
    },
    membersCountBadge: {
      backgroundColor: '#22C55E',
      borderRadius: 10,
      minWidth: 18,
      height: 18,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 5,
    },
    membersCountText: {
      fontSize: 10,
      fontWeight: '700',
      color: theme.colors.white,
    },
    membersListContent: {
      paddingVertical: theme.spacing.xs,
    },

    // Members empty state
    membersEmpty: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: theme.spacing.xl,
      paddingVertical: theme.spacing.xxl,
    },
    membersEmptyTitle: {
      fontSize: theme.fontSize.lg,
      fontWeight: '600',
      color: theme.colors.text,
      marginTop: theme.spacing.md,
    },
    membersEmptyText: {
      fontSize: theme.fontSize.md,
      color: theme.colors.textSecondary,
      textAlign: 'center',
      marginTop: theme.spacing.xs,
      lineHeight: 22,
    },

    // Member item
    memberItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm + 2,
      marginHorizontal: theme.spacing.sm,
      borderRadius: theme.borderRadius.md,
      gap: theme.spacing.sm,
      backgroundColor: theme.colors.white,
      marginBottom: 2,
    },
    memberAvatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    memberAvatarText: {
      fontSize: 13,
      fontWeight: '700',
    },
    memberOnlineDot: {
      position: 'absolute',
      bottom: 0,
      right: 0,
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: '#22C55E',
      borderWidth: 2,
      borderColor: theme.colors.white,
    },
    memberInfo: {
      flex: 1,
    },
    memberName: {
      fontSize: theme.fontSize.sm,
      fontWeight: '600',
      color: theme.colors.text,
    },
    memberPlatformRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      marginTop: 1,
    },
    memberPlatform: {
      fontSize: 11,
      color: theme.colors.textLight,
    },

    // Messages list
    messagesList: {
      paddingHorizontal: theme.spacing.md,
      paddingTop: theme.spacing.sm,
      paddingBottom: theme.spacing.sm,
    },
    chatEmptyList: {
      flexGrow: 1,
      backgroundColor: theme.colors.background,
    },

    // Chat empty state
    chatEmptyContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: theme.spacing.sm,
    },
    chatEmptyTitle: {
      fontSize: theme.fontSize.md,
      fontWeight: '500',
      color: theme.colors.textSecondary,
    },
    chatEmptyText: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.textLight,
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

    // Bubble footer
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
