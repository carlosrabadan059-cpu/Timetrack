import React from 'react';
import { Play, TrendingUp, Calendar, Zap } from 'lucide-react';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Badge from '../ui/Badge';

const DashboardView = ({ onStartWorkout, streak = 0, weeklyWorkouts = 0, nextWorkout }) => {
    return (
        <div className="space-y-6">
            {/* Welcome Section */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h2 className="text-3xl md:text-4xl font-bold text-white mb-2">
                        Hola, <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-active">Campeón</span> 👋
                    </h2>
                    <p className="text-gray-400">Listo para romper tus límites hoy?</p>
                </div>
                <div className="flex items-center gap-2 bg-surface-elevated px-4 py-2 rounded-full border border-white/5">
                    <span className="w-2 h-2 rounded-full bg-active animate-pulse"></span>
                    <span className="text-sm font-medium text-gray-300">Plan actual: Hipertrofia</span>
                </div>
            </div>

            {/* Main Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
                {/* Next Workout - Large Card */}
                <Card className="col-span-1 md:col-span-2 bg-gradient-to-br from-surface to-surface-elevated relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-32 bg-primary/5 rounded-full blur-3xl group-hover:bg-primary/10 transition-all duration-700"></div>

                    <div className="relative z-10">
                        <div className="flex justify-between items-start mb-6">
                            <Badge variant="primary" className="mb-2">Siguiente Sesión</Badge>
                            <Zap className="text-primary w-6 h-6" />
                        </div>

                        <h3 className="text-2xl md:text-3xl font-bold text-white mb-2">{nextWorkout?.nombre || "Cargando..."}</h3>
                        <p className="text-gray-400 mb-8 flex items-center gap-2">
                            <Calendar className="w-4 h-4" />
                            {nextWorkout?.ejercicios?.length || 0} ejercicios • ~60 min
                        </p>

                        <Button onClick={() => onStartWorkout(nextWorkout?.id)} className="w-full md:w-auto shadow-xl shadow-primary/20">
                            <Play className="w-5 h-5 fill-current" />
                            Comenzar Entrenamiento
                        </Button>
                    </div>
                </Card>

                {/* Stats Column */}
                <div className="space-y-4">
                    {/* Streak Card */}
                    <Card className="flex items-center justify-between">
                        <div>
                            <p className="text-gray-400 text-sm mb-1">Racha Actual</p>
                            <p className="text-3xl font-bold text-white">{streak} <span className="text-base font-normal text-gray-500">días</span></p>
                        </div>
                        <div className="w-12 h-12 rounded-full bg-orange-500/10 flex items-center justify-center">
                            <TrendingUp className="text-orange-500 w-6 h-6" />
                        </div>
                    </Card>

                    {/* Weekly Volume */}
                    <Card className="flex items-center justify-between">
                        <div>
                            <p className="text-gray-400 text-sm mb-1">Esta Semana</p>
                            <p className="text-3xl font-bold text-white">{weeklyWorkouts} <span className="text-base font-normal text-gray-500">sesiones</span></p>
                        </div>
                        <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center">
                            <Calendar className="text-green-500 w-6 h-6" />
                        </div>
                    </Card>
                </div>
            </div>

            {/* Routine Preview */}
            <h3 className="text-xl font-bold text-white mt-8 mb-4">Tu Rutina Semanal</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Placeholder for routine cards - will be mapped from data */}
                {['Pecho/Bíceps', 'Pierna/Glúteo', 'Dorsal/Tríceps', 'Hombro'].map((day, i) => (
                    <Card key={i} className="hover:border-primary/30 transition-colors cursor-pointer group">
                        <div className="flex justify-between items-center mb-3">
                            <Badge variant="default">Día {i + 1}</Badge>
                            <div className="w-2 h-2 rounded-full bg-gray-700 group-hover:bg-primary transition-colors"></div>
                        </div>
                        <h4 className="font-semibold text-white mb-1 group-hover:text-primary transition-colors">{day}</h4>
                        <p className="text-sm text-gray-500">8 ejercicios</p>
                    </Card>
                ))}
            </div>
        </div>
    );
};

export default DashboardView;
