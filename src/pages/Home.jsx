import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { PROXY_URL, DISCONNECT_URL, UNMUTE_URL } from '@/lib/proxyConfig';
import { useToast } from '@/components/ui/use-toast';
import SavedServers from '@/components/wizard/SavedServers';
import BotNameStep from '@/components/wizard/BotNameStep';
import ServerDetailsStep from '@/components/wizard/ServerDetailsStep';
import ChannelStep from '@/components/wizard/ChannelStep';
import LoadingScreen from '@/components/wizard/LoadingScreen';
import ConnectedScreen from '@/components/wizard/ConnectedScreen';
import DisconnectDialog from '@/components/wizard/DisconnectDialog';
import SoundSystemPanel from '@/components/wizard/SoundSystemPanel';
import WizardProgress from '@/components/wizard/WizardProgress';

export default function Home() {
  const { toast } = useToast();
  const [view, setView] = useState('saved-servers');
  const [wizardStep, setWizardStep] = useState(1);
  const [wizardData, setWizardData] = useState({});
  const [connectedServer, setConnectedServer] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [showDisconnect, setShowDisconnect] = useState(false);
  const [showSoundPanel, setShowSoundPanel] = useState(false);
  const [audioDeviceId, setAudioDeviceId] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [connectionData, setConnectionData] = useState(null);
  const [sessionId, setSessionId] = useState(null);

  const handleVACDetected = async () => {
    if (!sessionId) return;
    try {
      await fetch(UNMUTE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });
    } catch {}
  };

  const disconnectBot = async () => {
    const sid = sessionId;
    setSessionId(null);
    if (!sid) return;
    try {
      await fetch(DISCONNECT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sid }),
      });
    } catch {}
  };

  const attemptConnection = async (server) => {
    setView('loading');
    setConnectionData(null);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);
      const res = await fetch(PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: server.domain,
          tcp_port: server.tcp_port,
          udp_port: server.udp_port || server.tcp_port,
          username: server.username,
          password: server.password,
          channel_path: server.channel_path,
          bot_name: server.bot_name,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const text = await res.text();
      let data;
      try {
        data = text ? JSON.parse(text) : { connected: false, error: 'Empty response from bot proxy' };
      } catch {
        data = { connected: false, error: 'Invalid response from bot proxy' };
      }

      if (data.connected && data.joined) {
        setConnectionData(data);
        setSessionId(data.sessionId);
        setView('connected');
      } else {
        toast({
          title: 'Connection failed',
          description: data.error || 'Could not connect to the server',
          variant: 'destructive',
        });
        setConnectedServer(null);
        setView('saved-servers');
        setRefreshKey((k) => k + 1);
      }
    } catch (e) {
      toast({
        title: 'Connection failed',
        description: e.message || 'Network error reaching the bot proxy',
        variant: 'destructive',
      });
      setConnectedServer(null);
      setView('saved-servers');
      setRefreshKey((k) => k + 1);
    }
  };

  const handleStartNew = () => {
    setWizardData({});
    setWizardStep(1);
    setView('wizard');
  };

  const handleNameNext = (data) => {
    setWizardData((prev) => ({ ...prev, ...data }));
    setWizardStep(2);
  };

  const handleServerNext = (data) => {
    setWizardData((prev) => ({ ...prev, ...data }));
    setWizardStep(3);
  };

  const handleChannelConnect = (data) => {
    const full = { ...wizardData, ...data };
    setWizardData(full);
    setConnectedServer(full);
    attemptConnection(full);
  };

  const handleConnectSaved = (server) => {
    setConnectedServer(server);
    attemptConnection(server);
  };

  const handleBack = () => setWizardStep((s) => Math.max(1, s - 1));

  const handleBackToServers = () => {
    setConnectedServer(null);
    setView('saved-servers');
    setRefreshKey((k) => k + 1);
  };

  const handleSaveYes = async () => {
    setShowDisconnect(false);
    await disconnectBot();
    if (connectedServer && !connectedServer.id) {
      await base44.entities.BotServer.create({
        bot_name: connectedServer.bot_name,
        domain: connectedServer.domain,
        tcp_port: connectedServer.tcp_port,
        udp_port: connectedServer.udp_port,
        username: connectedServer.username,
        password: connectedServer.password,
        channel_path: connectedServer.channel_path,
      });
    }
    setConnectedServer(null);
    setView('saved-servers');
    setRefreshKey((k) => k + 1);
  };

  const handleSaveNo = async () => {
    setShowDisconnect(false);
    await disconnectBot();
    setConnectedServer(null);
    setWizardData({});
    setWizardStep(1);
    setView('wizard');
  };

  if (view === 'loading')
    return <LoadingScreen domain={connectedServer?.domain} />;

  if (view === 'connected' && connectedServer) {
    return (
      <>
        <ConnectedScreen
          server={connectedServer}
          connectionData={connectionData}
          onDisconnect={() => setShowDisconnect(true)}
          isMuted={isMuted}
          onSetMuted={setIsMuted}
          onOpenSoundPanel={() => setShowSoundPanel(true)}
          audioDeviceId={audioDeviceId}
        />
        <DisconnectDialog
          open={showDisconnect}
          onYes={handleSaveYes}
          onNo={handleSaveNo}
        />
        <SoundSystemPanel
          open={showSoundPanel}
          onClose={() => setShowSoundPanel(false)}
          onSelect={setAudioDeviceId}
          onVACDetected={handleVACDetected}
        />
      </>
    );
  }

  if (view === 'wizard') {
    return (
      <div className="mx-auto max-w-xl px-4 py-8">
        <WizardProgress currentStep={wizardStep} />
        <div className="mt-6">
          {wizardStep === 1 && (
            <BotNameStep initialData={wizardData} onNext={handleNameNext} />
          )}
          {wizardStep === 2 && (
            <ServerDetailsStep
              initialData={wizardData}
              onNext={handleServerNext}
              onBack={handleBack}
            />
          )}
          {wizardStep === 3 && (
            <ChannelStep
              initialData={wizardData}
              onConnect={handleChannelConnect}
              onBack={handleBack}
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <SavedServers
      onConnect={handleConnectSaved}
      onAddNew={handleStartNew}
      refreshKey={refreshKey}
    />
  );
}