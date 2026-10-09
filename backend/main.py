from fastapi import FastAPI, UploadFile, File
import uvicorn

app = FastAPI(title="Nexa - Backend", version="1.0")

@app.get("/")
def read_root():
    return {"status": "ok", "message": "Backend Python funcionando perfeitamente!"}

@app.post("/api/dda/process")
async def process_dda(file: UploadFile = File(...)):
    # Aqui entrará a lógica de inteligência de dados:
    # 1. Recebe o PDF da nota/boleto.
    # 2. Utiliza PyMuPDF (ou Tesseract para imagens) para extrair o texto.
    # 3. Mapeia e resume os dados (Data de vencimento, Valor, Fornecedor).
    # 4. Devolve o objeto pronto para o React salvar como "Tarefa".
    
    return {
        "status": "success",
        "filename": file.filename,
        "extracted_data": {
            "descricao": f"Pagamento - Processado de {file.filename}",
            "valor": "R$ 0,00", # TODO: Implementar extrator local
            "vencimento": "00/00/0000" # TODO: Implementar Regex
        }
    }

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
