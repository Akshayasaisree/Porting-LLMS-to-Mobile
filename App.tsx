import React, {useState, useRef} from 'react';
import {
  SafeAreaView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  PermissionsAndroid,
} from 'react-native';
import RNCalendarEvents from 'react-native-calendar-events';

type Message = {
  role: 'user' | 'ai' | 'system';
  content: string;
};

export default function App() {
  const [prompt, setPrompt] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [mode, setMode] = useState<'calendar' | 'normal'>('calendar');
  const scrollViewRef = useRef<ScrollView | null>(null);

  const scrollToBottom = () => {
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({animated: true});
    }, 100);
  };

  const requestCalendarPermissions = async () => {
    try {
      const granted = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.READ_CALENDAR,
        PermissionsAndroid.PERMISSIONS.WRITE_CALENDAR,
      ]);
      return (
        granted['android.permission.READ_CALENDAR'] ===
          PermissionsAndroid.RESULTS.GRANTED &&
        granted['android.permission.WRITE_CALENDAR'] ===
          PermissionsAndroid.RESULTS.GRANTED
      );
    } catch (err) {
      console.warn('Permission error', err);
      return false;
    }
  };

  const createCalendarEvent = async (
    title: string,
    date: string,
    time: string,
  ) => {
    try {
      const permission = await RNCalendarEvents.requestPermissions();

      if (permission !== 'authorized') {
        Alert.alert('Permission denied', 'Calendar access is required.');
        return;
      }

      const start = new Date(`${date}T${time}`);
      const end = new Date(start.getTime() + 60 * 60 * 1000); // 1 hour

      if (isNaN(start.getTime())) {
        throw new Error('Invalid date/time format.');
      }

      const defaultCalendar = await RNCalendarEvents.findCalendars();
      const calendarId = defaultCalendar.find(
        cal => cal.isPrimary || cal.allowsModifications,
      )?.id;

      if (!calendarId) {
        Alert.alert('No writable calendar found.');
        return;
      }

      const eventId = await RNCalendarEvents.saveEvent(title, {
        calendarId,
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        notes: 'Created via Chatbot App',
        alarms: [{date: -5}], // optional: 5 min before
      });

      if (eventId) {
        Alert.alert(
          'Event Saved',
          `${title} scheduled for ${start.toLocaleString()}`,
        );
      } else {
        Alert.alert('Event not saved', 'Something went wrong.');
      }
    } catch (err) {
      console.error('Calendar Error:', err);
      Alert.alert('Error', 'Failed to create event.');
    }
  };

  const sendPrompt = async () => {
    if (!prompt.trim() || isLoading) return;

    const userMsg: Message = {role: 'user', content: prompt};
    const loadingMsg: Message = {role: 'ai', content: 'Loading...'};

    setIsLoading(true);
    setMessages(prev => {
      const updated = [...prev, userMsg, loadingMsg];
      scrollToBottom();
      return updated;
    });
    setPrompt('');

    const endpoint = mode === 'calendar' ? 'calendar' : 'query';

    try {
      const res = await fetch(`http://10.0.2.16:5000/${endpoint}`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({prompt}),
      });

      const data = await res.json();
      
      let responseContent = 'No response.';
      if (data && typeof data === 'object') {
        if (data.response) {
          responseContent = data.response;
        } else if (data.error) {
          responseContent = data.error;
        } else {
          responseContent = JSON.stringify(data);
        }
      } else if (typeof data === 'string') {
        responseContent = data;
      }

      if (mode === 'calendar' && data.title && data.date && data.time) {
        await createCalendarEvent(data.title, data.date, data.time);
      }

      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = {role: 'ai', content: responseContent};
        scrollToBottom();
        return updated;
      });
    } catch (error: unknown) {
      setMessages(prev => {
        let errorMessage = 'Error: Unknown error occurred';
        if (
          typeof error === 'object' &&
          error !== null &&
          'message' in error &&
          typeof (error as any).message === 'string'
        ) {
          errorMessage = `Error: ${(error as any).message}`;
        }
        return [...prev, { role: 'system', content: errorMessage }];
      });
    }
    finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.container}>
        <ScrollView
          style={styles.responseView}
          ref={scrollViewRef}
          contentContainerStyle={{paddingBottom: 20}}>
          <View style={styles.header}>
            <Text style={styles.headerText}>Chatbot</Text>
          </View>

          <View style={styles.modeSelector}>
            <TouchableOpacity
              style={[
                styles.modeButton,
                mode === 'calendar' && styles.activeModeButton,
              ]}
              onPress={() => setMode('calendar')}>
              <Text style={styles.modeButtonText}>Calendar Events</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.modeButton,
                mode === 'normal' && styles.activeModeButton,
              ]}
              onPress={() => setMode('normal')}>
              <Text style={styles.modeButtonText}>Normal Commands</Text>
            </TouchableOpacity>
          </View>

          {messages.map((msg, index) => (
            <View
              key={index}
              style={msg.role === 'user' ? styles.userBubble : styles.aiBubble}>
              <Text
                style={[
                  styles.messageText,
                  msg.role === 'user' ? styles.userText : styles.aiText,
                ]}>
                {msg.content}
              </Text>
            </View>
          ))}
        </ScrollView>

        <View style={styles.inputWrapper}>
          <TextInput
            style={styles.textInput}
            value={prompt}
            onChangeText={setPrompt}
            placeholder="Type your prompt..."
            placeholderTextColor="#aaa"
            multiline
          />
          <TouchableOpacity
            style={[styles.sendButton, isLoading && {backgroundColor: '#555'}]}
            onPress={sendPrompt}
            disabled={isLoading}>
            <Text style={styles.sendButtonText}>
              {isLoading ? '...' : 'Send'}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  header: {
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 10,
  },
  headerText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  modeSelector: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 10,
  },
  modeButton: {
    padding: 10,
    marginHorizontal: 5,
    backgroundColor: '#444',
    borderRadius: 10,
  },
  activeModeButton: {
    backgroundColor: '#007bff',
  },
  modeButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  responseView: {
    flex: 1,
    padding: 16,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 22,
    marginBottom: 10,
  },
  userBubble: {
    backgroundColor: '#808080',
    alignSelf: 'flex-end',
    padding: 10,
    borderRadius: 15,
    marginBottom: 10,
  },
  aiBubble: {
    alignSelf: 'flex-start',
    padding: 10,
    borderRadius: 15,
    marginBottom: 10,
  },
  userText: {
    color: '#fff',
    textAlign: 'right',
  },
  aiText: {
    color: '#ffffff',
    textAlign: 'left',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#ddd',
    backgroundColor: '#121212',
  },
  textInput: {
    flex: 1,
    maxHeight: 120,
    minHeight: 40,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 16,
    backgroundColor: '#333',
    borderRadius: 16,
    color: '#fff',
  },
  sendButton: {
    marginLeft: 8,
    backgroundColor: '#007bff',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 16,
    justifyContent: 'center',
  },
  sendButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },

});

