import React, { useState, useEffect } from 'react';
import { X, Check, ChevronRight, Clock, Play, Pause, RotateCcw } from 'lucide-react';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import Input from '../ui/Input';

const TrainingView = ({ routine, dayId, onFinish, onCancel }) => {
    const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
    const [sessionData, setSessionData] = useState({});
    const [timerSeconds, setTimerSeconds] = useState(0);
    const [isTimerRunning, setIsTimerRunning] = useState(false);
    const [selectedExercise, setSelectedExercise] = useState(null);

    const dayData = routine?.[dayId] || { nombre: 'Entrenamiento', ejercicios: [] };
    const exercises = dayData.ejercicios || [];

    useEffect(() => {
        let interval;
        if (isTimerRunning) {
            interval = setInterval(() => setTimerSeconds(s => s + 1), 1000);
        }
        return () => clearInterval(interval);
    }, [isTimerRunning]);

    const formatTime = (secs) => {
        const mins = Math.floor(secs / 60);
        const s = secs % 60;
        return `${mins}:${s.toString().padStart(2, '0')}`;
    };

    const handleCompleteSet = (exerciseId, data) => {
        setSessionData(prev => ({
            ...prev,
            [exerciseId]: data
        }));
        setSelectedExercise(null);
    };

    return (
        <div className="pb-24">
            {/* Header */}
            <div className="flex items-center justify-between mb-6 sticky top-0 bg-screen/80 backdrop-blur-md py-4 z-40">
                <div>
                    <h2 className="text-2xl font-bold text-white">{dayData.nombre}</h2>
                    <p className="text-gray-400 text-sm">
                        {Object.keys(sessionData).length} / {exercises.length} completados
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="bg-surface border border-white/10 px-3 py-1 rounded-lg flex items-center gap-2">
                        <Clock className="w-4 h-4 text-primary" />
                        <span className="font-mono font-bold text-white">{formatTime(timerSeconds)}</span>
                    </div>
                    <Button variant="ghost" onClick={onCancel} className="!p-2">
                        <X className="w-6 h-6" />
                    </Button>
                </div>
            </div>

            {/* Exercises List */}
            <div className="space-y-3">
                {exercises.map((ex, idx) => {
                    const isCompleted = sessionData[ex.id];
                    const isActive = idx === currentExerciseIndex && !isCompleted;

                    return (
                        <Card
                            key={ex.id}
                            onClick={() => setSelectedExercise(ex)}
                            className={`transition-all cursor-pointer border-l-4 ${isCompleted
                                    ? 'border-l-success bg-success/5 border-success/20'
                                    : isActive
                                        ? 'border-l-active bg-active/5 border-active/20 transform scale-[1.02]'
                                        : 'border-l-transparent hover:bg-white/5'
                                }`}
                        >
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${isCompleted ? 'bg-success text-white' : 'bg-surface-elevated text-gray-400'
                                        }`}>
                                        {isCompleted ? <Check className="w-5 h-5" /> : idx + 1}
                                    </div>
                                    <div>
                                        <h3 className={`font-bold ${isCompleted ? 'text-gray-400 line-through' : 'text-white'}`}>
                                            {ex.nombre}
                                        </h3>
                                        <p className="text-sm text-gray-500">
                                            {ex.series} series × {ex.reps} reps
                                        </p>
                                    </div>
                                </div>
                                <ChevronRight className="text-gray-600" />
                            </div>
                        </Card>
                    );
                })}
            </div>

            {/* Global Controls */}
            <div className="fixed bottom-0 left-0 right-0 p-4 bg-surface border-t border-white/10 flex gap-4 md:pl-72 z-50">
                <Button
                    variant={isTimerRunning ? "secondary" : "primary"}
                    className="flex-1"
                    onClick={() => setIsTimerRunning(!isTimerRunning)}
                >
                    {isTimerRunning ? "Pausar" : "Reanudar"}
                </Button>
                <Button
                    variant="success"
                    className="flex-1"
                    onClick={() => onFinish({ duration: timerSeconds, exercises: sessionData })}
                    disabled={Object.keys(sessionData).length === 0}
                >
                    Finalizar
                </Button>
            </div>

            {/* Exercise Modal */}
            {selectedExercise && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-end md:items-center justify-center p-4 animate-fade-in">
                    <div className="bg-surface-elevated w-full max-w-lg rounded-2xl p-6 border border-white/10 shadow-2xl relative">
                        <button
                            onClick={() => setSelectedExercise(null)}
                            className="absolute top-4 right-4 text-gray-400 hover:text-white"
                        >
                            <X className="w-6 h-6" />
                        </button>

                        <h3 className="text-2xl font-bold text-white mb-1">{selectedExercise.nombre}</h3>
                        <Badge variant="primary">{selectedExercise.grupo}</Badge>

                        <div className="mt-6 flex gap-4 mb-6">
                            <div className="flex-1 bg-surface rounded-xl p-4 text-center">
                                <p className="text-gray-400 text-xs uppercase">Meta</p>
                                <p className="text-2xl font-bold text-white">{selectedExercise.series}</p>
                                <p className="text-xs text-gray-500">Series</p>
                            </div>
                            <div className="flex-1 bg-surface rounded-xl p-4 text-center">
                                <p className="text-gray-400 text-xs uppercase">Meta</p>
                                <p className="text-2xl font-bold text-white">{selectedExercise.reps}</p>
                                <p className="text-xs text-gray-500">Reps</p>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <Input type="number" placeholder="Peso (kg)" autoFocus />
                            <Input type="number" placeholder="Reps logradas" defaultValue={selectedExercise.reps} />

                            <Button
                                variant="primary"
                                className="w-full py-4 text-lg"
                                onClick={() => handleCompleteSet(selectedExercise.id, { completed: true })}
                            >
                                Registrar Serie
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TrainingView;
