import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, onSnapshot } from 'firebase/firestore';

// Componente principal da aplicação PostFast
function App() {
  // Estados para armazenar as seleções e entradas do usuário
  const [businessType, setBusinessType] = useState('');       // Tipo de negócio selecionado
  const [postType, setPostType] = useState('');             // Tipo de post selecionado
  const [postDetails, setPostDetails] = useState('');       // Detalhes fornecidos pelo usuário
  const [generatedText, setGeneratedText] = useState('');   // Texto gerado pela IA
  const [generatedImageUrl, setGeneratedImageUrl] = useState(''); // URL da imagem gerada pela IA
  const [isLoadingText, setIsLoadingText] = useState(false); // Estado de carregamento do texto
  const [isLoadingImage, setIsLoadingImage] = useState(false); // Estado de carregamento da imagem
  const [error, setError] = useState('');                   // Mensagens de erro

  // Estados para Firebase e perfil do usuário
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [businessProfile, setBusinessProfile] = useState({
    name: '',
    description: '',
    type: '',
    contact: ''
  });
  const [isProfileLoading, setIsProfileLoading] = useState(true);
  const [showModal, setShowModal] = useState(false); // Estado para controlar a exibição do modal
  const [modalMessage, setModalMessage] = useState(''); // Mensagem a ser exibida no modal


  // Opções para os tipos de negócio
  const businessTypes = [
    'Padaria', 'Loja de Roupas', 'Pet Shop', 'Açougue', 'Restaurante',
    'Cafeteria', 'Salão de Beleza', 'Barbearia', 'Farmácia', 'Livraria', 'Outro'
  ];

  // Opções para os tipos de post
  const postTypes = [
    'Promoção', 'Lançamento de Produto', 'Dica do Dia', 'Evento',
    'Novidade', 'Horário Especial', 'Engajamento', 'Outro'
  ];

  // Efeito para inicializar Firebase e autenticar o usuário
  useEffect(() => {
    try {
      const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
      const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};

      const app = initializeApp(firebaseConfig);
      const firestore = getFirestore(app);
      const firebaseAuth = getAuth(app);

      setDb(firestore);
      setAuth(firebaseAuth);

      // Listener para o estado de autenticação
      const unsubscribe = onAuthStateChanged(firebaseAuth, async (user) => {
        if (user) {
          setUserId(user.uid);
        } else {
          // Se não houver usuário logado, tenta autenticar anonimamente ou com token
          const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
          try {
            if (initialAuthToken) {
              await signInWithCustomToken(firebaseAuth, initialAuthToken);
            } else {
              await signInAnonymously(firebaseAuth);
            }
          } catch (authError) {
            console.error("Erro na autenticação:", authError);
            setError("Não foi possível autenticar. Algumas funcionalidades podem estar limitadas.");
          }
        }
        setIsAuthReady(true); // Indica que a autenticação inicial foi processada
      });

      return () => unsubscribe(); // Limpeza do listener
    } catch (err) {
      console.error("Erro ao inicializar Firebase:", err);
      setError("Erro ao inicializar o sistema. Por favor, tente novamente mais tarde.");
      setIsAuthReady(true); // Tenta continuar mesmo com erro de inicialização
    }
  }, []);

  // Efeito para carregar o perfil do negócio quando o usuário e o DB estiverem prontos
  useEffect(() => {
    if (isAuthReady && userId && db) {
      const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
      const profileDocRef = doc(db, `artifacts/${appId}/users/${userId}/businessProfile/myProfile`);

      const unsubscribe = onSnapshot(profileDocRef, (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setBusinessProfile({
            name: data.name || '',
            description: data.description || '',
            type: data.type || '',
            contact: data.contact || ''
          });
          // Preenche o campo businessType do formulário com o valor salvo
          setBusinessType(data.type || '');
        }
        setIsProfileLoading(false);
      }, (err) => {
        console.error("Erro ao carregar perfil:", err);
        setError("Erro ao carregar seu perfil de negócio.");
        setIsProfileLoading(false);
      });

      return () => unsubscribe(); // Limpeza do listener
    }
  }, [isAuthReady, userId, db]);

  /**
   * Função para exibir um modal com uma mensagem.
   * @param {string} message - A mensagem a ser exibida.
   */
  const showCustomModal = (message) => {
    setModalMessage(message);
    setShowModal(true);
  };

  /**
   * Função para fechar o modal.
   */
  const closeCustomModal = () => {
    setShowModal(false);
    setModalMessage('');
  };

  /**
   * Função para salvar o perfil do negócio no Firestore.
   * @returns {Promise<void>}
   */
  const saveBusinessProfile = async () => {
    if (!userId || !db) {
      showCustomModal("Erro: Usuário não autenticado ou banco de dados não disponível.");
      return;
    }
    if (!businessProfile.name || !businessProfile.description || !businessProfile.type) {
      showCustomModal("Por favor, preencha o Nome, Descrição e Tipo do Negócio antes de salvar.");
      return;
    }

    try {
      const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
      const profileDocRef = doc(db, `artifacts/${appId}/users/${userId}/businessProfile/myProfile`);
      await setDoc(profileDocRef, businessProfile, { merge: true });
      showCustomModal("Perfil do negócio salvo com sucesso!");
    } catch (err) {
      console.error("Erro ao salvar perfil:", err);
      showCustomModal(`Erro ao salvar perfil: ${err.message}`);
    }
  };

  /**
   * Função para gerar o texto do post usando a API Gemini.
   * @param {string} prompt - O prompt a ser enviado para a IA.
   * @returns {Promise<void>}
   */
  const generateText = async (prompt) => {
    setIsLoadingText(true);
    setGeneratedText('');
    setError('');

    try {
      const chatHistory = [];
      chatHistory.push({ role: "user", parts: [{ text: prompt }] });
      const payload = { contents: chatHistory };
      const apiKey = ""; // A chave da API será injetada pelo ambiente Canvas
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Erro na API Gemini: ${errorData.error.message || response.statusText}`);
      }

      const result = await response.json();
      if (result.candidates && result.candidates.length > 0 &&
          result.candidates[0].content && result.candidates[0].content.parts &&
          result.candidates[0].content.parts.length > 0) {
        const text = result.candidates[0].content.parts[0].text;
        setGeneratedText(text);
        // Após gerar o texto, tenta gerar a imagem
        generateImage(text);
      } else {
        setError('Não foi possível gerar o texto. Tente novamente.');
      }
    } catch (err) {
      console.error('Erro ao gerar texto:', err);
      setError(`Erro ao gerar texto: ${err.message}`);
    } finally {
      setIsLoadingText(false);
    }
  };

  /**
   * Função para gerar a imagem do post usando a API Imagen.
   * @param {string} textPrompt - O texto gerado que servirá de base para a imagem.
   * @returns {Promise<void>}
   */
  const generateImage = async (textPrompt) => {
    setIsLoadingImage(true);
    setGeneratedImageUrl('');

    // Cria um prompt mais descritivo para a imagem baseado no texto gerado e no tipo de negócio
    const imagePrompt = `Crie uma imagem de alta qualidade para um post de rede social sobre: "${textPrompt}". A imagem deve ser visualmente atraente e relevante para um negócio de ${businessProfile.type || businessType}.`;

    try {
      const payload = { instances: { prompt: imagePrompt }, parameters: { "sampleCount": 1 } };
      const apiKey = ""; // A chave da API será injetada pelo ambiente Canvas
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${apiKey}`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Erro na API Imagen: ${errorData.error.message || response.statusText}`);
      }

      const result = await response.json();
      if (result.predictions && result.predictions.length > 0 && result.predictions[0].bytesBase64Encoded) {
        const imageUrl = `data:image/png;base64,${result.predictions[0].bytesBase64Encoded}`;
        setGeneratedImageUrl(imageUrl);
      } else {
        setError('Não foi possível gerar a imagem. Tente novamente.');
      }
    } catch (err) {
      console.error('Erro ao gerar imagem:', err);
      setError(prev => prev ? `${prev} | Erro ao gerar imagem: ${err.message}` : `Erro ao gerar imagem: ${err.message}`);
    } finally {
      setIsLoadingImage(false);
    }
  };

  /**
   * Lida com o clique no botão "Gerar Post".
   * Constrói o prompt e inicia a geração de texto.
   * @returns {Promise<void>}
   */
  const handleGeneratePost = async () => {
    // Usa os dados do perfil salvo ou os campos do formulário se não houver perfil salvo
    const currentBusinessType = businessProfile.type || businessType;
    const currentBusinessName = businessProfile.name || 'um negócio';
    const currentBusinessDescription = businessProfile.description || '';

    if (!currentBusinessType || !postType || !postDetails) {
      showCustomModal('Por favor, preencha o Tipo de Negócio, Tipo de Post e Detalhes para gerar o post.');
      return;
    }

    let prompt = `Crie uma legenda de post para rede social (Instagram/Facebook) para o negócio "${currentBusinessName}", que é um(a) ${currentBusinessType}.`;
    if (currentBusinessDescription) {
      prompt += ` Breve descrição do negócio: "${currentBusinessDescription}".`;
    }
    prompt += ` O tipo de post é "${postType}". Detalhes adicionais: "${postDetails}". Inclua emojis relevantes e uma chamada para ação (CTA) clara.`;
    
    await generateText(prompt);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-100 p-4 sm:p-6 lg:p-8 font-inter flex flex-col items-center justify-center">
      <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-xl w-full max-w-4xl border border-gray-200">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-center text-purple-800 mb-6">
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-purple-600 to-indigo-600">PostFast</span>
        </h1>
        <p className="text-center text-gray-600 mb-8 text-lg">
          Crie posts incríveis para suas redes sociais em segundos!
        </p>

        {/* Exibição do User ID */}
        {userId && (
          <div className="text-center text-sm text-gray-500 mb-6 p-2 bg-gray-50 rounded-lg border border-gray-200">
            Seu ID de Usuário: <span className="font-mono text-gray-700 break-all">{userId}</span>
          </div>
        )}

        {/* Seção de Perfil do Negócio */}
        <div className="mb-8 p-4 bg-blue-50 rounded-xl border border-blue-200">
          <h2 className="text-2xl font-bold text-blue-800 mb-4 text-center">Meu Perfil de Negócio</h2>
          {isProfileLoading ? (
            <div className="flex items-center justify-center p-4">
              <svg className="animate-spin h-6 w-6 text-blue-600 mr-3" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <p className="text-blue-700">Carregando perfil...</p>
            </div>
          ) : (
            <>
              <div className="mb-4">
                <label htmlFor="businessName" className="block text-lg font-semibold text-gray-700 mb-2">
                  Nome do Negócio:
                </label>
                <input
                  type="text"
                  id="businessName"
                  value={businessProfile.name}
                  onChange={(e) => setBusinessProfile({ ...businessProfile, name: e.target.value })}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition duration-200 ease-in-out text-base"
                  placeholder="Ex: Padaria Delícias do Pão"
                />
              </div>

              <div className="mb-4">
                <label htmlFor="businessDescription" className="block text-lg font-semibold text-gray-700 mb-2">
                  Descrição do Negócio (opcional, mas ajuda a IA):
                </label>
                <textarea
                  id="businessDescription"
                  value={businessProfile.description}
                  onChange={(e) => setBusinessProfile({ ...businessProfile, description: e.target.value })}
                  rows="2"
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition duration-200 ease-in-out resize-y text-base"
                  placeholder="Ex: Somos uma padaria artesanal especializada em pães de fermentação natural e doces caseiros."
                ></textarea>
              </div>

              <div className="mb-4">
                <label htmlFor="businessTypeProfile" className="block text-lg font-semibold text-gray-700 mb-2">
                  Tipo de Negócio:
                </label>
                <select
                  id="businessTypeProfile"
                  value={businessProfile.type}
                  onChange={(e) => setBusinessProfile({ ...businessProfile, type: e.target.value })}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition duration-200 ease-in-out text-base"
                >
                  <option value="">Selecione um tipo de negócio</option>
                  {businessTypes.map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>

              <div className="mb-6">
                <label htmlFor="contactInfo" className="block text-lg font-semibold text-gray-700 mb-2">
                  Informações de Contato (opcional, para uso futuro):
                </label>
                <input
                  type="text"
                  id="contactInfo"
                  value={businessProfile.contact}
                  onChange={(e) => setBusinessProfile({ ...businessProfile, contact: e.target.value })}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition duration-200 ease-in-out text-base"
                  placeholder="Ex: @minhalojaoficial, www.minhaloja.com.br"
                />
              </div>

              <button
                onClick={saveBusinessProfile}
                disabled={!userId || !db}
                className="w-full bg-blue-600 text-white font-bold py-3 px-6 rounded-xl shadow-lg hover:bg-blue-700 transition duration-300 ease-in-out transform hover:scale-105 flex items-center justify-center text-lg"
              >
                Salvar Perfil
              </button>
            </>
          )}
        </div>

        {/* Seleção do Tipo de Post (Agora usa o tipo de negócio do perfil se salvo) */}
        <div className="mb-6">
          <label htmlFor="postType" className="block text-lg font-semibold text-gray-700 mb-2">
            1. Que tipo de post você quer criar?
          </label>
          <select
            id="postType"
            value={postType}
            onChange={(e) => setPostType(e.target.value)}
            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition duration-200 ease-in-out text-base"
          >
            <option value="">Selecione um tipo de post</option>
            {postTypes.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </div>

        {/* Detalhes do Post */}
        <div className="mb-8">
          <label htmlFor="postDetails" className="block text-lg font-semibold text-gray-700 mb-2">
            2. Digite os detalhes do seu post (ex: "50% de desconto em pizzas", "Nova coleção de inverno"):
          </label>
          <textarea
            id="postDetails"
            value={postDetails}
            onChange={(e) => setPostDetails(e.target.value)}
            rows="4"
            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition duration-200 ease-in-out resize-y text-base"
            placeholder="Ex: Promoção de Dia das Mães: 20% de desconto em todos os buquês de flores."
          ></textarea>
        </div>

        {/* Botão Gerar Post */}
        <button
          onClick={handleGeneratePost}
          disabled={isLoadingText || isLoadingImage || !isAuthReady || isProfileLoading}
          className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-bold py-3 px-6 rounded-xl shadow-lg hover:from-purple-700 hover:to-indigo-700 transition duration-300 ease-in-out transform hover:scale-105 flex items-center justify-center text-lg"
        >
          {(isLoadingText || isLoadingImage) ? (
            <svg className="animate-spin h-6 w-6 text-white mr-3" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          ) : (
            'Gerar Post'
          )}
        </button>

        {/* Área de Exibição do Conteúdo Gerado */}
        {error && (
          <div className="mt-8 p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg text-center">
            {error}
          </div>
        )}

        {(generatedText || generatedImageUrl) && (
          <div className="mt-10 p-6 bg-purple-50 rounded-xl shadow-inner border border-purple-200">
            <h2 className="text-2xl font-bold text-purple-800 mb-4 text-center">Seu Post Gerado:</h2>
            {isLoadingText ? (
              <div className="flex items-center justify-center p-4">
                <svg className="animate-spin h-8 w-8 text-purple-600 mr-3" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <p className="text-purple-700">Gerando texto...</p>
              </div>
            ) : (
              generatedText && (
                <div className="mb-6 p-4 bg-white rounded-lg shadow-sm border border-gray-200">
                  <h3 className="text-xl font-semibold text-gray-800 mb-2">Legenda:</h3>
                  <p className="text-gray-700 whitespace-pre-wrap">{generatedText}</p>
                </div>
              )
            )}

            {isLoadingImage ? (
              <div className="flex items-center justify-center p-4">
                <svg className="animate-spin h-8 w-8 text-purple-600 mr-3" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <p className="text-purple-700">Gerando imagem...</p>
              </div>
            ) : (
              generatedImageUrl && (
                <div className="p-4 bg-white rounded-lg shadow-sm border border-gray-200 text-center">
                  <h3 className="text-xl font-semibold text-gray-800 mb-2">Sugestão de Imagem:</h3>
                  <img
                    src={generatedImageUrl}
                    alt="Imagem gerada para o post"
                    className="max-w-full h-auto rounded-lg shadow-md mx-auto"
                    onError={(e) => { e.target.onerror = null; e.target.src = 'https://placehold.co/400x300/E0BBE4/FFFFFF?text=Erro+ao+carregar+imagem'; }}
                  />
                  <p className="text-sm text-gray-500 mt-2">
                    (Esta é uma sugestão visual. Você pode usar suas próprias fotos!)
                  </p>
                </div>
              )
            )}
          </div>
        )}

        {/* Modal de Mensagens Personalizadas */}
        {showModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm w-full text-center">
              <p className="text-lg font-semibold text-gray-800 mb-4">{modalMessage}</p>
              <button
                onClick={closeCustomModal}
                className="bg-purple-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-purple-700 transition duration-200"
              >
                OK
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Exporta o componente App como padrão
export default App;
