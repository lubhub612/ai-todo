import React, { useState, useEffect, useRef } from 'react';
//import axios from 'axios';
import { format, parseISO, isToday, isTomorrow, addDays, isAfter, isBefore, differenceInMinutes, differenceInHours,
  formatDistanceToNow, differenceInSeconds } from 'date-fns';
import SpeechRecognition, { useSpeechRecognition } from 'react-speech-recognition';
import './TodoList.css';

const TodoList = () => {
  const [tasks, setTasks] = useState([]);
  const [newTask, setNewTask] = useState('');
  const [aiSuggestions, setAiSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [parsedTask, setParsedTask] = useState(null);
  const [isListening, setIsListening] = useState(false);
  const [lastReminderTime, setLastReminderTime] = useState(null);
  const [timeLeft, setTimeLeft] = useState({});
  const [editingTask, setEditingTask] = useState(null);
  const [editText, setEditText] = useState('');
  const [editDueDateInput, setEditDueDateInput] = useState(''); 
  const reminderInterval = useRef(null)
  const checkInterval = useRef(null);
  const speechSynth = useRef(window.speechSynthesis);
  const spokenTasks = useRef(new Set());
  // Speech recognition setup
  const {
    transcript,
    listening,
    resetTranscript,
    browserSupportsSpeechRecognition
  } = useSpeechRecognition();

  const speechSynthesis = window.speechSynthesis;
  const utteranceRef = useRef(null);

  const speak = (text) => {
    if (speechSynthesis.speaking) {
      speechSynthesis.cancel();
    }
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utteranceRef.current = utterance;
    
    speechSynthesis.speak(utterance);
  };

  useEffect(() => {
    if (tasks.length > 0) {
      const lastTask = tasks[tasks.length - 1];
      let message = `Added: ${lastTask.text}`;
      
      if (lastTask.dueDate) {
        message += ` due ${formatDueDate(lastTask.dueDate)}`;
      }
      
      speak(message);
    }
  }, [tasks]);

  useEffect(() => {
    const interval = setInterval(() => {
      updateTimeLeft();
    }, 60000); // Update every minute

    updateTimeLeft(); // Run immediately
    return () => clearInterval(interval);
  }, [tasks]);

  const updateTimeLeft = () => {
    const now = new Date();
    const newTimeLeft = {};
    
    tasks.forEach(task => {
      if (task.dueDate && !task.completed) {
        const dueDate = parseISO(task.dueDate);
        if (isAfter(dueDate, now)) {
          newTimeLeft[task.id] = formatTimeLeft(now, dueDate);
        } else {
          newTimeLeft[task.id] = 'Overdue!';
        }
      }
    });
    
    setTimeLeft(newTimeLeft);
  };

  // Format time left as "X hours Y minutes" or "X minutes"
  const formatTimeLeft = (now, dueDate) => {
    const minutesLeft = differenceInMinutes(dueDate, now);
    const hoursLeft = differenceInHours(dueDate, now);

    if (minutesLeft <= 0) return 'Due now!';
    if (hoursLeft > 0) {
      const remainingMinutes = minutesLeft % 60;
      return `${hoursLeft} hour${hoursLeft !== 1 ? 's' : ''}${
        remainingMinutes > 0 ? ` ${remainingMinutes} minute${remainingMinutes !== 1 ? 's' : ''}` : ''
      } left`;
    }
    return `${minutesLeft} minute${minutesLeft !== 1 ? 's' : ''} left`;
  };

  useEffect(() => {
    // Set up 30-minute reminder interval
    reminderInterval.current = setInterval(checkReminders, 1000 * 60); // Check every minute
    
    return () => {
      clearInterval(reminderInterval.current);
    };
  }, [tasks]);

  // Clean up speech synthesis
  useEffect(() => {
    return () => {
      if (speechSynthesis.speaking) {
        speechSynthesis.cancel();
      }
    };
  }, []);

  // Handle voice input and auto-add tasks
  useEffect(() => {
    if (transcript && isListening) {
      setNewTask(transcript);
      const parsed = parseTaskInput(transcript);
      setParsedTask(parsed);
    }
  }, [transcript, isListening]);

  // Auto-add task when stopping listening
  useEffect(() => {
    if (!listening && isListening && transcript.trim().length > 0) {
      addTaskFromTranscript(transcript);
      resetTranscript();
      setIsListening(false);
    }
  }, [listening, isListening, transcript]);

  const addTaskFromTranscript = (transcript) => {
    const parsed = parseTaskInput(transcript);
    if (parsed.text.trim().length > 0) {
      const task = {
        id: Date.now(),
        text: parsed.text,
        dueDate: parsed.dueDate,
        completed: false,
        rawInput: parsed.rawInput,
        addedByVoice: true
      };
      setTasks([...tasks, task]);
      setNewTask('');
      setParsedTask(null);
    }
  };

  const startListening = () => {
    setIsListening(true);
    resetTranscript();
    SpeechRecognition.startListening({ continuous: true });
  };

  const stopListening = () => {
    SpeechRecognition.stopListening();
    if (transcript.trim().length > 0) {
      addTaskFromTranscript(transcript);
    }
    resetTranscript();
    setIsListening(false);
  };

   // Add a new task
  const addTask = () => {
    if (newTask.trim() === '') return;
    
    const parsed = parseTaskInput(newTask);
    const task = {
      id: Date.now(),
      text: parsed.text,
      dueDate: parsed.dueDate,
      completed: false,
      rawInput: parsed.rawInput,
      addedByVoice: isListening
    };
    
    setTasks([...tasks, task]);
    setNewTask('');
    setParsedTask(null);
    if (isListening) stopListening();
  };

  // Toggle task completion
  const toggleTask = (id) => {
    setTasks(tasks.map(task => 
      task.id === id ? { ...task, completed: !task.completed } : task
    ));
  };

  // Delete a task
  const deleteTask = (id) => {
    setTasks(tasks.filter(task => task.id !== id));
  };

  const checkReminders = () => {
    const now = new Date();
    
    // Only check every 30 minutes
    if (lastReminderTime && differenceInMinutes(now, lastReminderTime) < 15 ) {
      return;
    }

    // Get pending tasks
    const pendingTasks = tasks.filter(task => 
      !task.completed && 
      (!task.dueDate || isAfter(parseISO(task.dueDate), now))
    );

    if (pendingTasks.length > 0) {
      setLastReminderTime(now);
      showReminderNotification(pendingTasks);
    }
  };

  // Show reminder notification
  const showReminderNotification = (pendingTasks) => {
    const message = `You have ${pendingTasks.length} pending tasks:\n` +
      pendingTasks.map((task, index) => 
        `${index + 1}. ${task.text}${task.dueDate ? ` (due ${formatDueDate(task.dueDate)})` : ''}`
      ).join('\n');

    // Speak the reminder
    speak(`Reminder:\n${message}`);

    // Show browser notification if available
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('To-Do List Reminder', {
        body: message,
        icon: '/todo-icon.png'
      });
    } else if ('Notification' in window && Notification.permission !== 'denied') {
      Notification.requestPermission().then(permission => {
        if (permission === 'granted') {
          new Notification('To-Do List Reminder', {
            body: message,
            icon: '/todo-icon.png'
          });
        }
      });
    }

    // Alert as fallback
    alert(`Reminder:\n${message}`);
  };

  useEffect(() => {
    checkInterval.current = setInterval(() => {
      checkDueTasks();
    }, 60000); // Check every minute

    return () => clearInterval(checkInterval.current);
  }, [tasks]);

  // Check tasks that are due now
  const checkDueTasks = () => {
    const now = new Date();
    const dueTasks = tasks.filter(task => 
      task.dueDate && 
      !task.completed && 
      isBefore(parseISO(task.dueDate), now) &&
      differenceInMinutes(now, parseISO(task.dueDate)) <= 15 // Within 15 mins of due time
    );

    if (dueTasks.length > 0) {
      showReminder(dueTasks);
    }
  };

  // Show reminder notification
  const showReminder = (dueTasks) => {
    // Speak reminder
    const speak = (text) => {
      if (speechSynthesis.speaking) speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      speechSynthesis.speak(utterance);
    };

    const taskList = dueTasks.map(task => task.text).join(', ');
    speak(`Reminder: ${dueTasks.length} task${dueTasks.length > 1 ? 's are' : ' is'} due: ${taskList}`);

    // Show browser notification
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(`Task${dueTasks.length > 1 ? 's' : ''} Due`, {
        body: dueTasks.map(task => 
          `${task.text} - Due ${formatDueDate(task.dueDate)}`
        ).join('\n')
      });
    }

    // Visual alert
    alert(`Task${dueTasks.length > 1 ? 's' : ''} Due:\n${
      dueTasks.map(task => 
        `• ${task.text} (Due ${formatDueDate(task.dueDate)})`
      ).join('\n')
    }`);
  };

  useEffect(() => {
    if ('Notification' in window && Notification.permission !== 'granted') {
      Notification.requestPermission();
    }
  }, []);

  // Preview parsed task as user types
  const handleInputChange = (e) => {
    const input = e.target.value;
    setNewTask(input);
    
    if (input.trim().length > 5) {
      setParsedTask(parseTaskInput(input));
    } else {
      setParsedTask(null);
    }
  };

  // Format due date for display
   // Parse natural language input
   const parseTaskInput = (input) => {
    const text = input.trim();
    let dueDate = null;
    let parsedText = text;
    
    // Enhanced time pattern matching for voice input
    const timePattern = /(\bat\b|\bby\b|\bon\b)?\s*(\d{1,2}(:\d{2})?\s?([ap]\.?m\.?)?)/i;
    const timeMatch = text.match(timePattern);
    
    // Enhanced date patterns for voice input
    const datePattern = /(today|tonight|tomorrow|next week|in \d+ days?|on \w+day|\d{1,2}\/\d{1,2}\/\d{2,4})/i;
    const dateMatch = text.match(datePattern);
    
    if (timeMatch || dateMatch) {
      let date = new Date();
      
      if (dateMatch) {
        const dateStr = dateMatch[0].toLowerCase();
        if (dateStr === 'today' || dateStr === 'tonight') {
          // Keep current date
        } else if (dateStr === 'tomorrow') {
          date = addDays(date, 1);
        } else if (dateStr === 'next week') {
          date = addDays(date, 7);
        } else if (dateStr.startsWith('in ')) {
          const days = parseInt(dateStr.match(/\d+/)[0]);
          date = addDays(date, days);
        } else if (dateStr.startsWith('on ')) {
          const day = dateStr.replace('on ', '');
          // Simplified - would need proper day calculation
          date = addDays(date, 1);
        }
      }
      
      if (timeMatch) {
        const fullTimeStr = timeMatch[0];
        // Clean and normalize the time string
        const cleanTimeStr = fullTimeStr
          .replace(/^(\bat\b|\bby\b|\bon\b)\s*/i, '')
          .replace(/\./g, '') // Remove dots in a.m./p.m.
          .toLowerCase();
        
        // Extract time components
        const timeParts = cleanTimeStr.match(/(\d{1,2})(?::(\d{2}))?\s?(am|pm)?/);
        
        if (timeParts) {
          let hours = parseInt(timeParts[1]);
          const minutes = timeParts[2] ? parseInt(timeParts[2]) : 0;
          const period = timeParts[3] || '';
          
          // Convert to 24-hour format
          if (period === 'pm' && hours < 12) {
            hours += 12;
          } else if (period === 'am' && hours === 12) {
            hours = 0;
          }
          // Handle voice cases where "pm" might be separate
          else if (!period && text.toLowerCase().includes('pm') && hours < 12) {
            hours += 12;
          }
          
          date.setHours(hours, minutes, 0, 0);
        }
      } else {
        // Default to end of day if no time specified
        date.setHours(23, 59, 0, 0);
      }
      
      dueDate = date.toISOString();
      
      // Clean up the task text (works better for voice input)
      parsedText = text
        .replace(new RegExp(timeMatch?.[0] || '', 'i'), '')
        .replace(new RegExp(dateMatch?.[0] || '', 'i'), '')
        .replace(/\s+/g, ' ')
        .replace(/^\s*,\s*|\s*,\s*$/g, '')
        .trim();
    }
    
    return {
      text: parsedText || text,
      dueDate,
      rawInput: text
    };
  };

  // Enhanced formatDueDate for consistent time display
  const formatDueDate = (dueDate) => {
    if (!dueDate) return '';
    
    const date = parseISO(dueDate);
    // Always show time in 12-hour format with AM/PM
    const timeString = format(date, 'h:mm a');
    
    if (isToday(date)) {
      return `Today at ${timeString}`;
    } else if (isTomorrow(date)) {
      return `Tomorrow at ${timeString}`;
    } else {
      return `${format(date, 'MMM d, yyyy')} at ${timeString}`;
    }
  };

  // Handle voice input specifically
  useEffect(() => {
    if (transcript && !newTask && isListening) {
      const voiceInput = transcript;
      setNewTask(voiceInput);
      
      // Parse immediately for voice input
      const parsed = parseTaskInput(voiceInput);
      setParsedTask(parsed);
      
      // Auto-add if we have a clear task
      if (parsed.text && parsed.text.length > 3) {
        setTimeout(() => {
          addTask();
          resetTranscript();
        }, 1500); // Short delay to allow for corrections
      }
    }
  }, [transcript, isListening]);

  useEffect(() => {
    checkInterval.current = setInterval(() => {
      checkDueNowTasks();
    }, 1000); // Check every second for precision

    return () => clearInterval(checkInterval.current);
  }, [tasks]);

  // Check for tasks that are exactly due (0h 0m 0s)
  const checkDueNowTasks = () => {
    const now = new Date();
    
    tasks.forEach(task => {
      if (task.dueDate && !task.completed && !spokenTasks.current.has(task.id)) {
        const dueDate = parseISO(task.dueDate);
        const secondsLeft = differenceInSeconds(dueDate, now);
        
        // Exactly due (0h 0m 0s remaining)
        if (secondsLeft === 0) {
          speakTask(task);
          spokenTasks.current.add(task.id);
          flashTask(task.id);
        }
      }
    });
  };

  // Speak task with natural language timing
  const speakTask = (task) => {
    if (speechSynth.current.speaking) {
      speechSynth.current.cancel();
    }

    const utterance = new SpeechSynthesisUtterance();
    utterance.text = `This task is due now: ${task.text}`;
    utterance.rate = 1.0;
    utterance.pitch = 1.2; // Slightly higher pitch for urgency
    utterance.volume = 1;
    
    speechSynth.current.speak(utterance);
  };

  // Visual feedback for due tasks
  const flashTask = (taskId) => {
    const taskElement = document.querySelector(`.task-item[data-task-id="${taskId}"]`);
    if (taskElement) {
      taskElement.classList.add('due-now-active');
      setTimeout(() => {
        taskElement.classList.remove('due-now-active');
      }, 3000);
    }
  };

  // Format time left display
  

  const startEditing = (task) => {
    setEditingTask(task.id);
    setEditText(task.text);
    
    // Convert stored ISO date back to natural language for editing
    if (task.dueDate) {
      const date = parseISO(task.dueDate);
      let dateString = '';
      
      if (isToday(date)) {
        dateString = `today at ${format(date, 'h:mm a')}`;
      } else if (isTomorrow(date)) {
        dateString = `tomorrow at ${format(date, 'h:mm a')}`;
      } else {
        dateString = format(date, 'MMM d, yyyy h:mm a');
      }
      
      setEditDueDateInput(task.rawInput.split('at')[1]?.trim() || dateString);
    } else {
      setEditDueDateInput('');
    }
    
    spokenTasks.current.delete(task.id);
  };

  // Save edited task - FIXED
  const saveEdit = () => {
    const parsed = parseTaskInput(`${editText} ${editDueDateInput}`);
    
    setTasks(tasks.map(task => 
      task.id === editingTask ? { 
        ...task, 
        text: parsed.text,
        dueDate: parsed.dueDate,
        rawInput: `${editText} ${editDueDateInput}`.trim()
      } : task
    ));
    
    setEditingTask(null);
  };

  // Cancel editing
  const cancelEdit = () => {
    setEditingTask(null);
  };

  // Get AI suggestions
  

  if (!browserSupportsSpeechRecognition) {
    return <div className="browser-not-supported">
      Your browser doesn't support speech recognition. Please try Chrome or Edge.
    </div>;
  }

  return (
    <div className="todo-container">
      <h1>AI-Powered To-Do List</h1>
      
      <div className="input-section">
        <input
          type="text"
          value={newTask}
          onChange={handleInputChange}
          placeholder="Add a new task (e.g., 'Call mom tomorrow at 5pm')..."
          onKeyPress={(e) => e.key === 'Enter' && addTask()}
        />
        <button onClick={addTask}>Add Task</button>
        <button 
          onClick={isListening ? stopListening : startListening}
          className={isListening ? 'listening' : ''}
        >
          {isListening ? 'Stop Listening' : 'Voice Input'}
        </button>
      </div>
      
      {isListening && (
        <div className="voice-status">
          <div className="pulse"></div>
          Listening: {transcript || 'Speak now...'}
        </div>
      )}
      
      {parsedTask && (
        <div className="parsed-preview">
          <p>Task: {parsedTask.text}</p>
          {parsedTask.dueDate && (
            <p>Due: {formatDueDate(parsedTask.dueDate)}</p>
          )}
        </div>
      )}
      
      <div className="task-list">
        {tasks.map(task => (
          <div key={task.id} className={`task-item ${task.completed ? 'completed' : ''}`}>
           {editingTask === task.id ? (
              <div className="edit-form">
                <input
                  type="text"
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                />
                <input
            type="text"
            value={editDueDateInput}
            onChange={(e) => setEditDueDateInput(e.target.value)}
            placeholder="Due date (e.g., 'tomorrow 3pm')"
          />
                <div className="edit-actions">
                  <button onClick={saveEdit}>Save</button>
                  <button onClick={cancelEdit}>Cancel</button>
                </div>
              </div>
            ) : (
              <>
            <button 
              onClick={() => toggleTask(task.id)}
              className={`toggle-btn ${task.completed ? 'completed' : ''}`}
              aria-label={task.completed ? 'Mark as incomplete' : 'Mark as complete'}
            >
              <span className="toggle-thumb" />
            </button>
            <div className="task-content">
              <span>{task.text}</span>
              {task.dueDate && (
                <span className="due-date">
                  {formatDueDate(task.dueDate)}
                  {isAfter(new Date(), parseISO(task.dueDate)) && !task.completed && (
                    <span className="overdue"> (Overdue)</span>
                  )}
                </span>
              )}
              {task.dueDate && !task.completed && (
                <span className={`due-date ${
                  isBefore(parseISO(task.dueDate), new Date()) ? 'overdue' : ''
                }`}>
                  {timeLeft[task.id] || formatDueDate(task.dueDate)}
                </span>
              )}
              
              {task.addedByVoice && <span className="voice-badge">Voice</span>}
            </div>
            <div className="task-actions">
                  <button onClick={() => startEditing(task)}>Edit</button>
                  <button onClick={() => toggleTask(task.id)}>
                    {task.completed ? 'Undo' : 'Complete'}
                  </button>
                  <button onClick={() => deleteTask(task.id)}>Delete</button>
                </div>
                </>
            )}
          </div>
        ))}
      </div>
      
      
    </div>
  );
};

export default TodoList;