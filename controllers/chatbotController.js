import { getChatbotResponse, getAvailableModels, extractTextFromPDF } from '../services/chatbotService.js';

/**
 * Chat endpoint - handles mental support, resume builder, resume review, and PDF QA
 * POST /api/chatbot/chat
 * Body: { message: string, conversationHistory: Array, mode: string }
 * File: Optional (for resume-review or pdf-qa)
 */
export const chat = async (req, res) => {
  try {
    const { message, conversationHistory = [], mode = 'student-helper' } = req.body;
    let contextData = '';

    // Handle file upload if present
    if (req.file) {
      // Check if it's a PDF file (support multiple MIME types)
      const isPDF = req.file.mimetype === 'application/pdf' || 
                   req.file.mimetype === 'application/x-pdf' ||
                   req.file.originalname.toLowerCase().endsWith('.pdf') ||
                   req.file.buffer[0] === 0x25 && req.file.buffer[1] === 0x50 && req.file.buffer[2] === 0x44 && req.file.buffer[3] === 0x46; // PDF magic bytes: %PDF
      
      if (isPDF) {
        try {
          console.log('Processing PDF file:', {
            filename: req.file.originalname,
            size: req.file.size,
            mimetype: req.file.mimetype
          });
          
          contextData = await extractTextFromPDF(req.file.buffer);
          
          if (!contextData || contextData.trim().length === 0) {
            console.warn('PDF parsed but extracted text is empty');
            return res.status(400).json({ 
              success: false, 
              message: 'PDF file appears to be empty or could not be read. Please ensure the PDF contains text (not just images).' 
            });
          }
          
          console.log('PDF text extracted successfully, length:', contextData.length);
        } catch (pdfError) {
          console.error('PDF parsing error:', pdfError);
          return res.status(400).json({ 
            success: false, 
            message: `Failed to read PDF file: ${pdfError.message}. Please ensure the file is a valid PDF.` 
          });
        }
      } else {
        return res.status(400).json({ 
          success: false, 
          message: 'Only PDF files are currently supported. Please upload a .pdf file.' 
        });
      }
    }

    // Validate message (it might be empty if just uploading a file for initial analysis)
    if ((!message || typeof message !== 'string' || message.trim().length === 0) && !req.file) {
      return res.status(400).json({
        success: false,
        message: 'Message is required unless uploading a file'
      });
    }

    const parsedHistory = typeof conversationHistory === 'string'
      ? JSON.parse(conversationHistory)
      : conversationHistory;

    // Get chatbot response
    const result = await getChatbotResponse(message || 'Please analyze this document.', parsedHistory, mode, contextData);

    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: result.message || 'Failed to get chatbot response',
        error: result.error
      });
    }

    res.json({
      success: true,
      data: {
        response: result.message,
        model: result.model || 'unknown',
        usage: result.usage || {}
      }
    });
  } catch (error) {
    console.error('Chat controller error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal server error'
    });
  }
};

/**
 * Get available models
 * GET /api/chatbot/models
 */
export const getModels = async (req, res) => {
  try {
    const models = getAvailableModels();

    res.json({
      success: true,
      data: {
        models,
        recommended: process.env.GROQ_API_KEY ? 'groq' : 'ollama'
      }
    });
  } catch (error) {
    console.error('Get models error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to get available models'
    });
  }
};


