import React from 'react';
import { Dumbbell, LayoutDashboard, TrendingUp, MessageCircle, User } from 'lucide-react';

const Layout = ({ children, currentView, setView }) => {
    const navItems = [
        { id: 'dashboard', icon: LayoutDashboard, label: 'Inicio' },
        { id: 'training', icon: Dumbbell, label: 'Entrenar' },
        { id: 'progress', icon: TrendingUp, label: 'Progreso' },
        { id: 'chat', icon: MessageCircle, label: 'Coach IA' },
    ];

    return (
        <div className="min-h-screen bg-screen text-text-primary pb-24 md:pb-0 md:pl-64">
            {/* Desktop Sidebar */}
            <aside className="fixed left-0 top-0 h-full w-64 bg-surface border-r border-white/5 hidden md:flex flex-col p-6 z-50">
                <div className="flex items-center gap-3 mb-10">
                    <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
                        <Dumbbell className="text-white w-6 h-6" />
                    </div>
                    <h1 className="text-xl font-bold text-white tracking-tight">Gym<span className="text-primary">Tracker</span></h1>
                </div>

                <nav className="flex-1 space-y-2">
                    {navItems.map((item) => {
                        const Icon = item.icon;
                        const isActive = currentView === item.id;

                        return (
                            <button
                                key={item.id}
                                onClick={() => setView(item.id)}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${isActive
                                        ? 'bg-primary/10 text-primary font-semibold'
                                        : 'text-gray-400 hover:text-white hover:bg-white/5'
                                    }`}
                            >
                                <Icon className={`w-5 h-5 ${isActive ? 'text-primary' : ''}`} />
                                {item.label}
                            </button>
                        );
                    })}
                </nav>

                <div className="pt-6 border-t border-white/5">
                    <button className="flex items-center gap-3 text-gray-400 hover:text-white transition-colors w-full px-4 py-2">
                        <div className="w-8 h-8 rounded-full bg-surface-elevated flex items-center justify-center">
                            <User className="w-4 h-4" />
                        </div>
                        <div className="text-left">
                            <p className="text-sm font-medium text-white">Mi Perfil</p>
                            <p className="text-xs text-gray-500">Configuración</p>
                        </div>
                    </button>
                </div>
            </aside>

            {/* Mobile Header */}
            <header className="md:hidden fixed top-0 left-0 right-0 h-16 bg-surface/80 backdrop-blur-md border-b border-white/5 z-40 flex items-center justify-between px-4">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                        <Dumbbell className="text-white w-5 h-5" />
                    </div>
                    <span className="font-bold text-lg text-white">GymTracker</span>
                </div>
                <div className="w-8 h-8 rounded-full bg-surface-elevated flex items-center justify-center">
                    <User className="w-4 h-4 text-gray-400" />
                </div>
            </header>

            {/* Main Content */}
            <main className="pt-20 md:pt-8 px-4 md:px-8 max-w-7xl mx-auto animate-fade-in">
                {children}
            </main>

            {/* Mobile Bottom Navigation */}
            <nav className="md:hidden fixed bottom-6 left-4 right-4 bg-surface/90 backdrop-blur-lg border border-white/10 rounded-2xl p-2 z-50 flex justify-between shadow-2xl shadow-black/50">
                {navItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = currentView === item.id;

                    return (
                        <button
                            key={item.id}
                            onClick={() => setView(item.id)}
                            className={`flex-1 flex flex-col items-center justify-center py-2 rounded-xl transition-all relative ${isActive ? 'text-white' : 'text-gray-500'
                                }`}
                        >
                            <div className={`absolute inset-0 bg-white/5 rounded-xl transition-all duration-300 ${isActive ? 'opacity-100 scale-100' : 'opacity-0 scale-90'}`} />
                            <Icon className={`w-6 h-6 relative z-10 mb-1 ${isActive ? 'text-primary drop-shadow-[0_0_8px_rgba(59,130,246,0.5)]' : ''}`} />
                            <span className={`text-[10px] font-medium relative z-10 ${isActive ? 'text-primary' : ''}`}>{item.label}</span>
                        </button>
                    );
                })}
            </nav>
        </div>
    );
};

export default Layout;
