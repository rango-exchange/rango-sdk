import { Button, Modal, Spacer, Switch, Typography } from '@rango-dev/ui'
import React from 'react'
import { useMessagingProtocols } from '../../hooks/useMessagingProtocols'

const MessagingProtocolsModal = ({
  open,
  handleClose,
}: {
  open: boolean
  handleClose: () => void
}) => {
  const { protocols, selectedProtocols, handleSelectedProtocolsChange } =
    useMessagingProtocols()

  return (
    <Modal
      open={open}
      onClose={handleClose}
      content={
        <div>
          {protocols.map((protocol, index) => (
            <>
              <Button
                variant="outlined"
                size="large"
                suffix={
                  <Switch
                    checked={selectedProtocols.includes(protocol)}
                    onChange={() => handleSelectedProtocolsChange(protocol)}
                  />
                }
                align="start"
                key={index}
              >
                <Typography variant="body2">{protocol}</Typography>
              </Button>
              <Spacer size={16} direction="vertical" />
            </>
          ))}
        </div>
      }
      title={'Messaging Protocols'}
      containerStyle={{ width: '560px', height: 'auto' }}
    />
  )
}

export default MessagingProtocolsModal
