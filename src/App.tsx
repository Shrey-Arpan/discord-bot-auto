import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Calendar, 
  Clock, 
  MessageSquare, 
  Trash2, 
  Plus, 
  CheckCircle, 
  XCircle, 
  AlertCircle,
  LayoutDashboard,
  Settings,
  Bot,
  ExternalLink,
  Github
} from 'lucide-react';
import { format } from 'date-fns';

interface ScheduledMessage {
  id: string;
  userId: string;
  username: string;
  channelId: string;
  message: string;
  scheduledTime: string;
  createdAt: string;
  status: 'pending' | 'sent' | 'cancelled';
  category: string;
}

export default function App() {
  const [messages, setMessages] = useState<ScheduledMessage[]>([]);
  const [koyaMessages, setKoyaMessages] = useState<ScheduledMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'sent' | 'cancelled'>('all');
  const [view, setView] = useState<'user' | 'koya'>('user');

  const fetchMessages = async () => {
    try {
      const response = await fetch('/api/messages');
      if (response.ok) {
        const data = await response.json();
        
        const sortFn = (a: ScheduledMessage, b: ScheduledMessage) => 
          new Date(b.scheduledTime).getTime() - new Date(a.scheduledTime).getTime();

        setMessages((data.user_messages || []).sort(sortFn));
        setKoyaMessages((data.koya_messages || []).sort(sortFn));
      }
    } catch (error) {
      console.error("Error fetching messages:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMessages();
    // Poll for updates every 10 seconds since we don't have real-time Firestore anymore
    const interval = setInterval(fetchMessages, 10000);
    return () => clearInterval(interval);
  }, []);

  const currentMessages = view === 'user' ? messages : koyaMessages;
  const filteredMessages = currentMessages.filter(m => activeTab === 'all' || m.status === activeTab);

  const stats = {
    total: currentMessages.length,
    pending: currentMessages.filter(m => m.status === 'pending').length,
    sent: currentMessages.filter(m => m.status === 'sent').length,
    cancelled: currentMessages.filter(m => m.status === 'cancelled').length,
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-zinc-100 font-sans selection:bg-indigo-500/30">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 h-full w-64 bg-[#111111] border-r border-white/5 p-6 hidden lg:block">
        <div className="flex items-center gap-3 mb-10">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-600/20">
            <Bot className="w-6 h-6 text-white" />
          </div>
          <h1 className="font-bold text-xl tracking-tight">Schedulord</h1>
        </div>

        <nav className="space-y-2">
          <button 
            onClick={() => setView('user')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all ${
              view === 'user' ? 'bg-indigo-600/10 text-indigo-400' : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5'
            }`}
          >
            <LayoutDashboard className="w-5 h-5" />
            User Messages
          </button>
          <button 
            onClick={() => setView('koya')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all ${
              view === 'koya' ? 'bg-indigo-600/10 text-indigo-400' : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5'
            }`}
          >
            <Bot className="w-5 h-5" />
            Koya Game
          </button>
          <button className="w-full flex items-center gap-3 px-4 py-3 text-zinc-500 hover:text-zinc-300 hover:bg-white/5 rounded-xl font-medium transition-all">
            <Settings className="w-5 h-5" />
            Settings
          </button>
        </nav>

        <div className="absolute bottom-6 left-6 right-6">
          <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
            <p className="text-xs text-zinc-500 mb-2 uppercase tracking-widest font-semibold">Bot Status</p>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-sm font-medium text-emerald-500">Online</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="lg:ml-64 p-4 md:p-8 lg:p-12">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
          <div>
            <h2 className="text-3xl font-bold tracking-tight mb-2">
              {view === 'user' ? 'User Dashboard' : 'Koya Game Dashboard'}
            </h2>
            <p className="text-zinc-500">
              {view === 'user' 
                ? 'Monitor and manage all scheduled Discord messages.' 
                : 'Automate your One Piece adventure with Koya bot.'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <a 
              href="https://discord.com/api/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=2147483648&scope=bot%20applications.commands"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-semibold transition-all shadow-lg shadow-indigo-600/20"
            >
              Invite Bot
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </header>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          {[
            { label: 'Total Messages', value: stats.total, icon: MessageSquare, color: 'text-zinc-400' },
            { label: 'Pending', value: stats.pending, icon: Clock, color: 'text-amber-400' },
            { label: 'Sent', value: stats.sent, icon: CheckCircle, color: 'text-emerald-400' },
            { label: 'Cancelled', value: stats.cancelled, icon: XCircle, color: 'text-rose-400' },
          ].map((stat, i) => (
            <motion.div 
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="bg-[#111111] p-6 rounded-2xl border border-white/5 shadow-sm"
            >
              <div className="flex items-center justify-between mb-4">
                <div className={`p-2 rounded-lg bg-white/5 ${stat.color}`}>
                  <stat.icon className="w-5 h-5" />
                </div>
              </div>
              <p className="text-zinc-500 text-sm font-medium mb-1">{stat.label}</p>
              <h3 className="text-2xl font-bold">{stat.value}</h3>
            </motion.div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 mb-8 overflow-x-auto pb-2 no-scrollbar">
          {(['all', 'pending', 'sent', 'cancelled'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-2 rounded-full text-sm font-medium transition-all capitalize ${
                activeTab === tab 
                  ? 'bg-white text-black' 
                  : 'bg-white/5 text-zinc-500 hover:text-zinc-300 hover:bg-white/10'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Messages List */}
        <div className="bg-[#111111] rounded-3xl border border-white/5 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-bottom border-white/5">
                  <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">User</th>
                  <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Message</th>
                  <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Scheduled For</th>
                  <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Channel</th>
                  <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                <AnimatePresence mode="popLayout">
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-zinc-500">
                        <div className="flex flex-col items-center gap-3">
                          <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                          Loading messages...
                        </div>
                      </td>
                    </tr>
                  ) : filteredMessages.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-zinc-500">
                        <div className="flex flex-col items-center gap-3">
                          <AlertCircle className="w-8 h-8 opacity-20" />
                          No messages found in this category.
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredMessages.map((msg) => (
                      <motion.tr 
                        layout
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        key={msg.id} 
                        className="group hover:bg-white/[0.02] transition-colors"
                      >
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-[10px] font-bold text-indigo-400 border border-white/5">
                              {msg.username?.substring(0, 2).toUpperCase() || '??'}
                            </div>
                            <div>
                              <div className="text-sm font-medium text-zinc-200">{msg.username || 'Unknown'}</div>
                              <div className="text-[10px] text-zinc-600 font-mono">{msg.userId}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-5">
                          <div className="max-w-xs truncate font-medium text-zinc-200" title={msg.message}>
                            {msg.message}
                          </div>
                          <div className="text-xs text-zinc-600 mt-1 font-mono">ID: {msg.id}</div>
                        </td>
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-2 text-zinc-400">
                            <Calendar className="w-4 h-4" />
                            <span className="text-sm">
                              {format(new Date(msg.scheduledTime), 'MMM d, yyyy')}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-zinc-600 mt-1">
                            <Clock className="w-4 h-4" />
                            <span className="text-xs">
                              {format(new Date(msg.scheduledTime), 'h:mm a')}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-5">
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/5 text-zinc-400 text-xs font-medium">
                            <span className="text-zinc-600">#</span>
                            {msg.channelId}
                          </div>
                        </td>
                        <td className="px-6 py-5">
                          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
                            msg.status === 'pending' ? 'bg-amber-500/10 text-amber-500' :
                            msg.status === 'sent' ? 'bg-emerald-500/10 text-emerald-500' :
                            'bg-rose-500/10 text-rose-500'
                          }`}>
                            <div className={`w-1.5 h-1.5 rounded-full ${
                              msg.status === 'pending' ? 'bg-amber-500' :
                              msg.status === 'sent' ? 'bg-emerald-500' :
                              'bg-rose-500'
                            }`} />
                            {msg.status}
                          </span>
                        </td>
                        <td className="px-6 py-5 text-right">
                          <button className="p-2 text-zinc-600 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-all opacity-0 group-hover:opacity-100">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </motion.tr>
                    ))
                  )}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
