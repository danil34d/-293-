
"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2, MessageSquare, Send, Trash2, Edit, Save, X } from "lucide-react";
import type { WashEvent, WashComment } from "@/types";
import { DialogDescription } from "../ui/dialog";
import { ScrollArea } from "../ui/scroll-area";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { Avatar, AvatarFallback } from "../ui/avatar";
import { useAuth } from "@/contexts/AuthContext";
import { DeleteConfirmationButton } from "./DeleteConfirmationButton";
import { handleCommentUpdate } from "@/app/wash-log/actions";
import { isEmployeeAdmin } from "@/lib/employee-role";


interface CommentDialogProps {
    event: WashEvent;
    employeeMap: Map<string, string>;
    trigger?: React.ReactNode;
}

export function CommentDialog({ event, employeeMap, trigger }: CommentDialogProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [newComment, setNewComment] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { toast } = useToast();
    const { employee: loggedInEmployee } = useAuth();
    const [editingCommentIndex, setEditingCommentIndex] = useState<number | null>(null);
    const [editingText, setEditingText] = useState("");

    const isManager = isEmployeeAdmin(loggedInEmployee);

    const handleAddComment = async () => {
        if (!newComment.trim() || !loggedInEmployee) return;

        setIsSubmitting(true);
        try {
            const newCommentObject: WashComment = {
                text: newComment,
                authorId: loggedInEmployee.id,
                date: new Date().toISOString()
            };
            const updatedComments = [...(event.driverComments || []), newCommentObject];

            await handleCommentUpdate(event.id, updatedComments);
            toast({ title: "Комментарий добавлен" });
            setNewComment("");
            event.driverComments = updatedComments;

        } catch (error: any) {
            toast({ title: "Ошибка", description: error.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleEditClick = (index: number, text: string) => {
        setEditingCommentIndex(index);
        setEditingText(text);
    };

    const handleCancelEdit = () => {
        setEditingCommentIndex(null);
        setEditingText("");
    };

    const handleSaveEdit = async () => {
        if (editingCommentIndex === null || !editingText.trim()) return;

        setIsSubmitting(true);
        try {
            const updatedComments = [...(event.driverComments || [])];
            updatedComments[editingCommentIndex] = {
                ...updatedComments[editingCommentIndex],
                text: editingText,
            };

            await handleCommentUpdate(event.id, updatedComments);
            toast({ title: "Комментарий обновлен" });
            event.driverComments = updatedComments;
            handleCancelEdit();
        } catch (error: any) {
            toast({ title: "Ошибка", description: error.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const handleDeleteComment = async (indexToDelete: number) => {
        setIsSubmitting(true);
        try {
            const updatedComments = (event.driverComments || []).filter((_, index) => index !== indexToDelete);
            await handleCommentUpdate(event.id, updatedComments);
            toast({ title: "Комментарий удален" });
            event.driverComments = updatedComments;
        } catch (error: any) {
            toast({ title: "Ошибка удаления", description: error.message, variant: "destructive"});
        } finally {
            setIsSubmitting(false);
        }
    };


    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                {trigger || (
                    <Button variant="ghost" size="icon" className="h-7 w-7">
                         <MessageSquare className="h-4 w-4 text-muted-foreground" />
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="max-w-xl">
                <DialogHeader>
                    <DialogTitle>Комментарии к мойке {event.vehicleNumber}</DialogTitle>
                    <DialogDescription>
                        Обсуждение и заметки, относящиеся к водителю или автомобилю.
                    </DialogDescription>
                </DialogHeader>
                <div className="flex flex-col space-y-4">
                    <ScrollArea className="h-64 pr-4 -mr-4">
                        <div className="space-y-4">
                        {(event.driverComments && event.driverComments.length > 0) ? (
                            event.driverComments.map((comment, index) => {
                                if (typeof comment !== 'object' || comment === null || !comment.text) {
                                    return null; // Skip rendering invalid comment formats
                                }
                                const commentText = typeof comment.text === 'string' ? comment.text : JSON.stringify(comment.text);
                                const isEditing = editingCommentIndex === index;
                                return (
                                    <div key={index} className="flex items-start gap-3 group">
                                        <Avatar className="h-8 w-8">
                                            <AvatarFallback>
                                                {employeeMap.get(comment.authorId)?.charAt(0) || 'U'}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div className="flex-1">
                                            <div className="flex items-center justify-between text-xs">
                                                <span className="font-semibold">{employeeMap.get(comment.authorId) || 'Неизвестный'}</span>
                                                <span className="text-muted-foreground">{format(new Date(comment.date), 'dd.MM.yy HH:mm', { locale: ru })}</span>
                                            </div>
                                            {isEditing ? (
                                                <div className="mt-1 space-y-2">
                                                    <Textarea 
                                                        value={editingText}
                                                        onChange={(e) => setEditingText(e.target.value)}
                                                        className="text-sm"
                                                        rows={3}
                                                    />
                                                    <div className="flex justify-end gap-2">
                                                        <Button size="sm" variant="ghost" onClick={handleCancelEdit}><X className="h-4 w-4 mr-1"/>Отмена</Button>
                                                        <Button size="sm" onClick={handleSaveEdit} disabled={isSubmitting}>
                                                            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin"/> : <Save className="h-4 w-4 mr-1"/>}
                                                            Сохранить
                                                        </Button>
                                                    </div>
                                                </div>
                                            ) : (
                                                 <div className="relative">
                                                    <p className="text-sm p-2 bg-muted rounded-md mt-1 whitespace-pre-wrap">{commentText}</p>
                                                     {isManager && (
                                                        <div className="absolute top-0 right-0 flex opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleEditClick(index, commentText)}><Edit className="h-3 w-3"/></Button>
                                                            <DeleteConfirmationButton
                                                                onSuccess={() => handleDeleteComment(index)}
                                                                entityName={`комментарий "${commentText.substring(0, 20)}..."`}
                                                                description="Вы уверены, что хотите удалить этот комментарий?"
                                                                toastTitle="Комментарий удален"
                                                                toastDescription="Комментарий был успешно удален."
                                                                apiPath="" // Not used as onSuccess is provided
                                                                entityId="" // Not used
                                                                trigger={
                                                                     <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive"><Trash2 className="h-3 w-3"/></Button>
                                                                }
                                                            />
                                                        </div>
                                                     )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })
                        ) : (
                            <p className="text-center text-muted-foreground pt-10">Комментариев еще нет.</p>
                        )}
                        </div>
                    </ScrollArea>
                    <div className="relative">
                        <Textarea
                            value={newComment}
                            onChange={(e) => setNewComment(e.target.value)}
                            placeholder="Напишите новый комментарий..."
                            rows={3}
                            className="pr-12"
                        />
                        <Button 
                            size="icon" 
                            className="absolute bottom-2 right-2 h-8 w-8"
                            onClick={handleAddComment}
                            disabled={isSubmitting || !newComment.trim()}
                        >
                            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin"/> : <Send className="h-4 w-4" />}
                        </Button>
                    </div>
                </div>
                 <DialogFooter>
                    <DialogClose asChild><Button type="button" variant="outline">Закрыть</Button></DialogClose>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
