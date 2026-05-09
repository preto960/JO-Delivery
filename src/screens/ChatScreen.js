import React, {useState, useEffect, useRef, useCallback} from 'react';
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
  StyleSheet,
  RefreshControl,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {useAuth} from '@context/AuthContext';
import apiService from '@services/api';
import {
  getPusherClient,
  subscribeToOrderChannel,
  unsubscribeFromOrderChannel,
} from '@services/pusher';
import theme from '@theme/styles';
import useThemeColors from '@hooks/useThemeColors';

const formatTime = dateStr => {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
};

export default function ChatScreen({route, navigation}) {
  const {orderId, orderNumber, otherUserName} = route.params;
  const {user, token} = useAuth();
  const {primary} = useThemeColors();
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const flatListRef = useRef(null);
  const pusherRef = useRef(null);
  const channelRef = useRef(null);

  // Set header title
  useEffect(() => {
    navigation.setOptions({
      headerTitle: `Chat Pedido #${orderNumber || orderId}`,
      headerShown: true,
      headerStyle: {
        backgroundColor: theme.colors.white,
      },
      headerTintColor: theme.colors.text,
      headerTitleStyle: {
        fontSize: theme.fontSize.lg,
        fontWeight: '600',
        color: theme.colors.text,
      },
    });
  }, [navigation, orderNumber, orderId]);

  const fetchMessages = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiService.fetchChatMessages(orderId);
      if (res && res.messages) {
        setMessages(res.messages);
      }
    } catch (err) {
      console.error('Error fetching messages:', err);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  const handleRefresh = useCallback(async () => {
    try {
      setRefreshing(true);
      const res = await apiService.fetchChatMessages(orderId);
      if (res && res.messages) {
        setMessages(res.messages);
      }
    } catch (err) {
      console.error('Error refreshing messages:', err);
    } finally {
      setRefreshing(false);
    }
  }, [orderId]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  // Subscribe to Pusher channel
  useEffect(() => {
    if (!token || !orderId) return;

    const pusher = getPusherClient(token);
    pusherRef.current = pusher;
    const channel = subscribeToOrderChannel(pusher, orderId);
    channelRef.current = channel;

    if (channel) {
      channel.bind('new-message', data => {
        setMessages(prev => {
          if (prev.some(m => m.id === data.id)) return prev;
          return [...prev, data];
        });
      });
    }

    return () => {
      if (channelRef.current) {
        channelRef.current.unbind('new-message');
        unsubscribeFromOrderChannel(pusherRef.current, orderId);
      }
    };
  }, [token, orderId]);

  const sendMessage = async () => {
    if (!inputText.trim() || sending) return;
    const content = inputText.trim();
    setInputText('');
    setSending(true);
    try {
      await apiService.sendChatMessage(orderId, content, 'delivery');
    } catch (err) {
      console.error('Error sending message:', err);
      setInputText(content);
    } finally {
      setSending(false);
    }
  };

  // Auto-scroll to bottom on new message
  useEffect(() => {
    if (messages.length > 0 && flatListRef.current) {
      setTimeout(() => flatListRef.current?.scrollToEnd({animated: true}), 100);
    }
  }, [messages]);

  const isOwnMessage = msg => String(msg.senderId) === String(user?.id);

  const renderMessage = useCallback(
    ({item}) => {
      const own = isOwnMessage(item);
      return (
        <View
          style={[
            styles.messageRow,
            own ? styles.messageRowOwn : styles.messageRowOther,
          ]}>
          {/* Sender name for other user's messages */}
          {!own && (
            <Text style={styles.senderName}>
              {item.senderName || otherUserName || 'Cliente'}
            </Text>
          )}
          <View
            style={[
              styles.bubble,
              own ? styles.bubbleOwn : styles.bubbleOther,
            ]}>
            <Text
              style={[styles.bubbleText, own ? styles.bubbleTextOwn : styles.bubbleTextOther]}>
              {item.content}
            </Text>
            <Text
              style={[
                styles.bubbleTime,
                own ? styles.bubbleTimeOwn : styles.bubbleTimeOther,
              ]}>
              {formatTime(item.createdAt)}
            </Text>
          </View>
        </View>
      );
    },
    [otherUserName, user?.id],
  );

  const renderEmptyChat = () => {
    if (loading) return null;
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="chatbubble-outline" size={56} color={theme.colors.textLight} />
        <Text style={styles.emptyTitle}>Sin mensajes</Text>
        <Text style={styles.emptyText}>
          Inicia una conversacion con{' '}
          {otherUserName || 'el cliente'}.
        </Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}>
        {/* Messages list */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={primary} />
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={item => String(item.id)}
            renderItem={renderMessage}
            ListEmptyComponent={renderEmptyChat}
            contentContainerStyle={
              messages.length === 0 && !loading
                ? styles.flatListEmpty
                : styles.flatListContent
            }
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                colors={[primary]}
                tintColor={primary}
              />
            }
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() =>
              flatListRef.current?.scrollToEnd({animated: false})
            }
          />
        )}

        {/* Input bar */}
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
          </View>
          <TouchableOpacity
            style={[
              styles.sendButton,
              {backgroundColor: primary},
              (!inputText.trim() || sending) && styles.sendButtonDisabled,
            ]}
            onPress={sendMessage}
            disabled={!inputText.trim() || sending}
            activeOpacity={0.8}>
            {sending ? (
              <ActivityIndicator size="small" color={theme.colors.white} />
            ) : (
              <Ionicons name="send" size={20} color={theme.colors.white} />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F0F2F5',
  },
  keyboardAvoid: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F0F2F5',
  },
  flatListContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  flatListEmpty: {
    flex: 1,
  },
  messageRow: {
    marginBottom: 12,
    maxWidth: '80%',
  },
  messageRowOwn: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
  },
  messageRowOther: {
    alignSelf: 'flex-start',
    alignItems: 'flex-start',
  },
  senderName: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    marginBottom: 4,
    marginLeft: 4,
  },
  bubble: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    shadowColor: '#0000000A',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 1,
  },
  bubbleOwn: {
    backgroundColor: theme.colors.accent,
    borderBottomRightRadius: 6,
  },
  bubbleOther: {
    backgroundColor: '#FFFFFF',
    borderBottomLeftRadius: 6,
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 20,
  },
  bubbleTextOwn: {
    color: theme.colors.white,
  },
  bubbleTextOther: {
    color: theme.colors.text,
  },
  bubbleTime: {
    fontSize: 10,
    marginTop: 4,
  },
  bubbleTimeOwn: {
    color: 'rgba(255, 255, 255, 0.7)',
    textAlign: 'right',
  },
  bubbleTimeOther: {
    color: theme.colors.textSecondary,
    textAlign: 'left',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: theme.fontSize.xl,
    fontWeight: '600',
    color: theme.colors.text,
    marginTop: 12,
  },
  emptyText: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: theme.colors.white,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
  },
  inputWrapper: {
    flex: 1,
    backgroundColor: theme.colors.inputBg,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    marginRight: 10,
    maxHeight: 100,
    justifyContent: 'center',
  },
  textInput: {
    fontSize: 15,
    color: theme.colors.text,
    textAlignVertical: 'center',
  },
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Platform.OS === 'ios' ? 0 : 0,
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
});
