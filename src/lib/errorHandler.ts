import { toast } from "sonner";

export function handleSupabaseError(error: any, fallbackMessage: string = "Ocorreu um erro inesperado") {
  console.error("Supabase Error:", error);
  
  let message = fallbackMessage;
  
  if (error.message) {
    if (error.message.includes("violates foreign key constraint")) {
      message = "Erro de integridade: Registro relacionado não encontrado.";
    } else if (error.message.includes("unique constraint")) {
      message = "Já existe um registro com estes dados.";
    } else {
      message = error.message;
    }
  }

  toast.error(message);
  return new Error(message);
}
