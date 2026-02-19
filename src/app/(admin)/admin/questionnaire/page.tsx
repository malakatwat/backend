'use client';

import React, { useEffect, useState } from 'react';
import { Plus, Trash2, Edit, Loader2, X, HelpCircle, List } from 'lucide-react';

interface Question {
  id: number;
  question_text: string;
  question_type: 'text' | 'number' | 'single_choice' | 'multiple_choice';
  options: any; // Stored as JSON array in DB
  is_active: boolean;
}

export default function QuestionnairePage() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Modal & Form State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  
  const [formData, setFormData] = useState({
    question_text: '',
    question_type: 'text',
    optionsString: '', // We use a comma-separated string for easy editing
    is_active: true
  });

  // Fetch Questions
  useEffect(() => {
    fetchQuestions();
  }, []);

  const fetchQuestions = async () => {
    try {
      const res = await fetch('/api/questions');
      const data = await res.json();
      setQuestions(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to fetch questions', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Delete Question
  const handleDelete = async (id: number) => {
    if (!confirm('Delete this question?')) return;
    try {
      await fetch(`/api/questions?id=${id}`, { method: 'DELETE' });
      setQuestions(prev => prev.filter(q => q.id !== id));
    } catch (error) {
      alert('Failed to delete');
    }
  };

  // Submit Form
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    
    // Convert comma-separated string to array for DB
    const optionsArray = formData.optionsString
        .split(',')
        .map(opt => opt.trim())
        .filter(opt => opt.length > 0);

    const payload = {
        question_text: formData.question_text,
        question_type: formData.question_type,
        options: optionsArray.length > 0 ? optionsArray : null,
        is_active: formData.is_active
    };

    try {
      const method = editingId ? 'PUT' : 'POST';
      const body = editingId ? { ...payload, id: editingId } : payload;

      const res = await fetch('/api/questions', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error('Failed to save');

      await fetchQuestions();
      closeModal();
    } catch (error) {
      alert('Error saving question');
    } finally {
      setIsSaving(false);
    }
  };

  const openCreate = () => {
    setEditingId(null);
    setFormData({ question_text: '', question_type: 'text', optionsString: '', is_active: true });
    setIsModalOpen(true);
  };

  const openEdit = (q: Question) => {
    setEditingId(q.id);
    
    // Parse JSON options back into a comma-separated string for the input field
    let parsedOptions = '';
    if (q.options) {
        try {
            const arr = typeof q.options === 'string' ? JSON.parse(q.options) : q.options;
            parsedOptions = Array.isArray(arr) ? arr.join(', ') : '';
        } catch(e) {}
    }

    setFormData({
      question_text: q.question_text,
      question_type: q.question_type,
      optionsString: parsedOptions,
      is_active: Boolean(q.is_active)
    });
    setIsModalOpen(true);
  };

  const closeModal = () => setIsModalOpen(false);

  // Helper to format question type
  const formatType = (type: string) => {
      return type.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  };

  if (isLoading) return <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-green-600"/></div>;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
            <h2 className="text-3xl font-bold text-gray-800">Signup Questionnaire</h2>
            <p className="text-gray-500 text-sm mt-1">Manage the questions users see when they register.</p>
        </div>
        <button 
          onClick={openCreate}
          className="bg-green-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-green-700 transition"
        >
          <Plus size={20} /> Add Question
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-left">
            <thead className="bg-gray-50 border-b">
                <tr>
                    <th className="p-4 font-semibold text-gray-600 w-1/2">Question</th>
                    <th className="p-4 font-semibold text-gray-600">Type</th>
                    <th className="p-4 font-semibold text-gray-600">Status</th>
                    <th className="p-4 font-semibold text-gray-600 text-right">Actions</th>
                </tr>
            </thead>
            <tbody className="divide-y">
                {questions.length === 0 ? (
                    <tr><td colSpan={4} className="p-8 text-center text-gray-500">No questions found.</td></tr>
                ) : (
                    questions.map(q => (
                        <tr key={q.id} className="hover:bg-gray-50 transition">
                            <td className="p-4">
                                <p className="font-medium text-gray-800">{q.question_text}</p>
                                {/* Show options preview if applicable */}
                                {(q.question_type === 'single_choice' || q.question_type === 'multiple_choice') && q.options && (
                                    <div className="flex items-center gap-1 mt-1 text-xs text-gray-500">
                                        <List size={12} /> 
                                        {Array.isArray(q.options) ? q.options.join(', ') : (typeof q.options === 'string' ? JSON.parse(q.options).join(', ') : '')}
                                    </div>
                                )}
                            </td>
                            <td className="p-4 text-gray-600 text-sm">{formatType(q.question_type)}</td>
                            <td className="p-4">
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${q.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                                    {q.is_active ? 'Active' : 'Hidden'}
                                </span>
                            </td>
                            <td className="p-4 text-right">
                                <div className="flex items-center justify-end gap-2">
                                    <button onClick={() => openEdit(q)} className="text-blue-600 hover:bg-blue-50 p-2 rounded-full"><Edit size={18} /></button>
                                    <button onClick={() => handleDelete(q.id)} className="text-red-600 hover:bg-red-50 p-2 rounded-full"><Trash2 size={18} /></button>
                                </div>
                            </td>
                        </tr>
                    ))
                )}
            </tbody>
        </table>
      </div>

      {/* MODAL FORM */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b">
              <h3 className="text-lg font-bold flex items-center gap-2">
                  <HelpCircle size={20} className="text-green-600"/> 
                  {editingId ? 'Edit Question' : 'New Question'}
              </h3>
              <button onClick={closeModal}><X size={20} className="text-gray-500 hover:text-red-500"/></button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Question Text</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. What is your primary goal?"
                  className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-green-500 outline-none"
                  value={formData.question_text}
                  onChange={e => setFormData({...formData, question_text: e.target.value})}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Answer Type</label>
                <select 
                    className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-green-500 outline-none"
                    value={formData.question_type}
                    onChange={e => setFormData({...formData, question_type: e.target.value as any})}
                >
                    <option value="text">Short Text Answer</option>
                    <option value="number">Numeric Answer (e.g. Age/Weight)</option>
                    <option value="single_choice">Single Choice (Radio Buttons)</option>
                    <option value="multiple_choice">Multiple Choice (Checkboxes)</option>
                </select>
              </div>

              {/* Show Options input ONLY if choice-type is selected */}
              {(formData.question_type === 'single_choice' || formData.question_type === 'multiple_choice') && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Options (Comma separated)</label>
                    <textarea 
                        required
                        className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-green-500 outline-none"
                        rows={2}
                        placeholder="Lose Weight, Gain Muscle, Maintain Weight"
                        value={formData.optionsString}
                        onChange={e => setFormData({...formData, optionsString: e.target.value})}
                    />
                  </div>
              )}

              <div className="flex items-center gap-2 pt-2">
                  <input 
                      type="checkbox" 
                      id="isActive"
                      checked={formData.is_active}
                      onChange={e => setFormData({...formData, is_active: e.target.checked})}
                      className="w-4 h-4 text-green-600 rounded focus:ring-green-500"
                  />
                  <label htmlFor="isActive" className="text-sm font-medium text-gray-700">Active (Visible to users)</label>
              </div>

              <div className="pt-4 flex gap-3 border-t">
                <button type="button" onClick={closeModal} className="flex-1 py-2 text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200">
                  Cancel
                </button>
                <button type="submit" disabled={isSaving} className="flex-1 py-2 text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50">
                  {isSaving ? 'Saving...' : 'Save Question'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}