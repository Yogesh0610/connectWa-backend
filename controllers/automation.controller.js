import { AutomationFlow, AutomationExecution } from '../models/index.js';
import automationEngine from '../utils/automation-engine.js';
import automationCache from '../utils/automation-cache.js';


export const getAutomationFlows = async (req, res) => {
  try {
    const userId = req.user.owner_id;
    const { page = 1, limit = 10, search = '', is_active = '' } = req.query;

    const filter = { user_id: userId, deleted_at: null };

    if (search) {
      filter.name = { $regex: search, $options: 'i' };
    }

    if (is_active !== '') {
      filter.is_active = is_active === 'true';
    }

    const skip = (page - 1) * limit;

    const flows = await AutomationFlow.find(filter)
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('user_id', 'name email');

    const total = await AutomationFlow.countDocuments(filter);

    res.json({
      success: true,
      data: flows,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Error getting automation flows:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get automation flows',
      error: error.message
    });
  }
};


export const getAutomationFlow = async (req, res) => {
  try {
    const userId = req.user.owner_id;
    const { flowId } = req.params;

    const flow = await AutomationFlow.findOne({
      _id: flowId,
      user_id: userId,
      deleted_at: null
    }).populate('user_id', 'name email');

    if (!flow) {
      return res.status(404).json({
        success: false,
        message: 'Automation flow not found'
      });
    }

    res.json({
      success: true,
      data: flow
    });
  } catch (error) {
    console.error('Error getting automation flow:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get automation flow',
      error: error.message
    });
  }
};


export const createAutomationFlow = async (req, res) => {
  try {
    const userId = req.user.owner_id;
    const { name, description, nodes, connections, triggers, settings } = req.body;

    if (!name || !nodes || !Array.isArray(nodes)) {
      return res.status(400).json({
        success: false,
        message: 'Name and nodes are required'
      });
    }

    const flow = await AutomationFlow.create({
      name,
      description: description || '',
      user_id: userId,
      nodes: nodes || [],
      connections: connections || [],
      triggers: triggers || [],
      settings: settings || {}
    });

    automationCache.clearUserCache(userId);

    res.status(201).json({
      success: true,
      message: 'Automation flow created successfully',
      data: flow
    });
  } catch (error) {
    console.error('Error creating automation flow:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create automation flow',
      error: error.message
    });
  }
};


export const updateAutomationFlow = async (req, res) => {
  try {
    const userId = req.user.owner_id;
    const { flowId } = req.params;
    const { name, description, nodes, connections, triggers, settings, is_active } = req.body;

    const flow = await AutomationFlow.findOne({
      _id: flowId,
      user_id: userId,
      deleted_at: null
    });

    if (!flow) {
      return res.status(404).json({
        success: false,
        message: 'Automation flow not found'
      });
    }

    if (name !== undefined) flow.name = name;
    if (description !== undefined) flow.description = description;
    if (nodes !== undefined) flow.nodes = nodes;
    if (connections !== undefined) flow.connections = connections;
    if (triggers !== undefined) flow.triggers = triggers;
    if (settings !== undefined) flow.settings = settings;
    if (is_active !== undefined) flow.is_active = is_active;

    await flow.save();

    automationCache.invalidateFlowCache(flowId, userId);

    res.json({
      success: true,
      message: 'Automation flow updated successfully',
      data: flow
    });
  } catch (error) {
    console.error('Error updating automation flow:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update automation flow',
      error: error.message
    });
  }
};


export const deleteAutomationFlow = async (req, res) => {
  try {
    const userId = req.user.owner_id;
    const { flowId } = req.params;

    const flow = await AutomationFlow.findOne({
      _id: flowId,
      user_id: userId,
      deleted_at: null
    });

    if (!flow) {
      return res.status(404).json({
        success: false,
        message: 'Automation flow not found'
      });
    }

    flow.deleted_at = new Date();
    await flow.save();

    automationCache.invalidateFlowCache(flowId, userId);

    res.json({
      success: true,
      message: 'Automation flow deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting automation flow:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete automation flow',
      error: error.message
    });
  }
};


export const toggleAutomationFlow = async (req, res) => {
  try {
    const userId = req.user.owner_id;
    const { flowId } = req.params;
    const { is_active } = req.body;

    const flow = await AutomationFlow.findOne({
      _id: flowId,
      user_id: userId,
      deleted_at: null
    });

    if (!flow) {
      return res.status(404).json({
        success: false,
        message: 'Automation flow not found'
      });
    }

    flow.is_active = is_active;
    await flow.save();

    automationCache.invalidateFlowCache(flowId, userId);

    res.json({
      success: true,
      message: `Automation flow ${is_active ? 'activated' : 'deactivated'} successfully`,
      data: flow
    });
  } catch (error) {
    console.error('Error toggling automation flow:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to toggle automation flow',
      error: error.message
    });
  }
};


export const testAutomationFlow = async (req, res) => {
  try {
    const userId = req.user.owner_id;
    const { flowId } = req.params;

    const { test_data } = req.body;
    test_data.userId = userId;

    const flow = await AutomationFlow.findOne({
      _id: flowId,
      user_id: userId,
      is_active: true,
      deleted_at: null
    });

    if (!flow) {
      return res.status(404).json({
        success: false,
        message: 'Automation flow not found or not active'
      });
    }

    const result = await automationEngine.executeFlow(flow, {
      ...test_data,
      event_type: 'test',
      timestamp: new Date()
    });

    res.json({
      success: true,
      message: 'Automation flow test completed',
      data: result
    });
  } catch (error) {
    console.error('Error testing automation flow:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to test automation flow',
      error: error.message
    });
  }
};


export const getAutomationExecutions = async (req, res) => {
  try {
    const userId = req.user.owner_id;
    const { flowId } = req.params;
    const { page = 1, limit = 10, status = '' } = req.query;

    const filter = { user_id: userId };
    if (flowId) {
      filter.flow_id = flowId;
    }
    if (status) {
      filter.status = status;
    }

    const skip = (page - 1) * limit;

    const executions = await AutomationExecution.find(filter)
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('flow_id', 'name description')
      .populate('user_id', 'name email');

    const total = await AutomationExecution.countDocuments(filter);

    res.json({
      success: true,
      data: executions,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Error getting automation executions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get automation executions',
      error: error.message
    });
  }
};


export const getAutomationExecution = async (req, res) => {
  try {
    const userId = req.user.owner_id;
    const { executionId } = req.params;

    const execution = await AutomationExecution.findOne({
      _id: executionId,
      user_id: userId
    }).populate('flow_id', 'name description')
      .populate('user_id', 'name email');

    if (!execution) {
      return res.status(404).json({
        success: false,
        message: 'Automation execution not found'
      });
    }

    res.json({
      success: true,
      data: execution
    });
  } catch (error) {
    console.error('Error getting automation execution:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get automation execution',
      error: error.message
    });
  }
};


export const getAutomationStatistics = async (req, res) => {
  try {
    const userId = req.user.owner_id;

    const [totalFlows, activeFlows, totalExecutions, successfulExecutions] = await Promise.all([
      AutomationFlow.countDocuments({ user_id: userId, deleted_at: null }),
      AutomationFlow.countDocuments({ user_id: userId, is_active: true, deleted_at: null }),
      AutomationExecution.countDocuments({ user_id: userId }),
      AutomationExecution.countDocuments({ user_id: userId, status: 'success' })
    ]);

    const recentExecutions = await AutomationExecution.find({
      user_id: userId
    })
    .sort({ created_at: -1 })
    .limit(10)
    .select('flow_id status created_at execution_time');

    res.json({
      success: true,
      data: {
        total_flows: totalFlows,
        active_flows: activeFlows,
        total_executions: totalExecutions,
        successful_executions: successfulExecutions,
        success_rate: totalExecutions > 0 ? (successfulExecutions / totalExecutions * 100).toFixed(2) : 0,
        recent_executions: recentExecutions
      }
    });
  } catch (error) {
    console.error('Error getting automation statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get automation statistics',
      error: error.message
    });
  }
};


export const getAvailableNodeTypes = async (req, res) => {
  try {
    const nodeTypes = [
      {
        id: 'trigger',
        name: 'Trigger',
        description: 'Starts the automation workflow',
        category: 'input',
        icon: 'trigger',
        inputs: 0,
        outputs: 1,
        parameters: [
          {
            name: 'event_type',
            type: 'select',
            options: [
              { value: 'message_received', label: 'Message Received' },
              { value: 'message_sent', label: 'Message Sent' },
              { value: 'contact_joined', label: 'Contact Joined' },
              { value: 'status_update', label: 'Status Update' },
              { value: 'order_received', label: 'Order Received' },
              { value: 'webhook_received', label: 'Webhook Received' },
              { value: 'time_based', label: 'Time Based' },
              { value: 'custom_event', label: 'Custom Event' }
            ]
          }
        ]
      },
      {
        id: 'condition',
        name: 'Condition',
        description: 'Branch the workflow based on conditions',
        category: 'logic',
        icon: 'condition',
        inputs: 1,
        outputs: 2,
        parameters: [
          {
            name: 'condition',
            type: 'object',
            fields: [
              { name: 'field', type: 'text', label: 'Field' },
              {
                name: 'operator',
                type: 'select',
                label: 'Operator',
                options: [
                  { value: 'equals', label: 'Equals' },
                  { value: 'not_equals', label: 'Not Equals' },
                  { value: 'contains', label: 'Contains' },
                  { value: 'not_contains', label: 'Not Contains' },
                  { value: 'starts_with', label: 'Starts With' },
                  { value: 'ends_with', label: 'Ends With' },
                  { value: 'greater_than', label: 'Greater Than' },
                  { value: 'less_than', label: 'Less Than' },
                  { value: 'is_empty', label: 'Is Empty' },
                  { value: 'is_not_empty', label: 'Is Not Empty' }
                ]
              },
              { name: 'value', type: 'text', label: 'Value' }
            ]
          }
        ]
      },
      {
        id: 'action',
        name: 'Action',
        description: 'Perform an action in the workflow',
        category: 'action',
        icon: 'action',
        inputs: 1,
        outputs: 1,
        parameters: [
          {
            name: 'action_type',
            type: 'select',
            options: [
              { value: 'log', label: 'Log Message' },
              { value: 'set_variable', label: 'Set Variable' },
              { value: 'wait', label: 'Wait/Delay' }
            ]
          }
        ]
      },
      {
        id: 'send_message',
        name: 'Send Message',
        description: 'Send a WhatsApp message',
        category: 'action',
        icon: 'message',
        inputs: 1,
        outputs: 1,
        parameters: [
          { name: 'recipient', type: 'text', label: 'Recipient Number' },
          { name: 'message_template', type: 'textarea', label: 'Message Template' },
          { name: 'media_url', type: 'text', label: 'Media URL (Optional)' }
        ]
      },
      {
        id: 'webhook',
        name: 'Webhook',
        description: 'Call an external API',
        category: 'action',
        icon: 'webhook',
        inputs: 1,
        outputs: 1,
        parameters: [
          { name: 'url', type: 'text', label: 'Webhook URL' },
          { name: 'method', type: 'select', options: [
            { value: 'GET', label: 'GET' },
            { value: 'POST', label: 'POST' },
            { value: 'PUT', label: 'PUT' },
            { value: 'DELETE', label: 'DELETE' }
          ]},
          { name: 'headers', type: 'object', label: 'Headers' },
          { name: 'body', type: 'object', label: 'Request Body' }
        ]
      },
      {
        id: 'ai_response',
        name: 'AI Response',
        description: 'Generate response using AI',
        category: 'ai',
        icon: 'ai',
        inputs: 1,
        outputs: 1,
        parameters: [
          { name: 'ai_model', type: 'text', label: 'AI Model' },
          { name: 'prompt_template', type: 'textarea', label: 'Prompt Template' },
          { name: 'api_key', type: 'text', label: 'API Key' }
        ]
      },
      {
        id: 'delay',
        name: 'Delay',
        description: 'Wait for a specified time',
        category: 'utility',
        icon: 'delay',
        inputs: 1,
        outputs: 1,
        parameters: [
          { name: 'delay_ms', type: 'number', label: 'Delay (milliseconds)', default: 1000 }
        ]
      },
      {
        id: 'filter',
        name: 'Filter',
        description: 'Filter data based on conditions',
        category: 'logic',
        icon: 'filter',
        inputs: 1,
        outputs: 1,
        parameters: [
          {
            name: 'filter_condition',
            type: 'object',
            fields: [
              { name: 'field', type: 'text', label: 'Field' },
              {
                name: 'operator',
                type: 'select',
                label: 'Operator',
                options: [
                  { value: 'equals', label: 'Equals' },
                  { value: 'not_equals', label: 'Not Equals' },
                  { value: 'contains', label: 'Contains' },
                  { value: 'not_contains', label: 'Not Contains' },
                  { value: 'starts_with', label: 'Starts With' },
                  { value: 'ends_with', label: 'Ends With' },
                  { value: 'greater_than', label: 'Greater Than' },
                  { value: 'less_than', label: 'Less Than' },
                  { value: 'is_empty', label: 'Is Empty' },
                  { value: 'is_not_empty', label: 'Is Not Empty' }
                ]
              },
              { name: 'value', type: 'text', label: 'Value' }
            ]
          }
        ]
      }
    ];

    res.json({
      success: true,
      data: nodeTypes
    });
  } catch (error) {
    console.error('Error getting node types:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get node types',
      error: error.message
    });
  }
};


export const preloadUserFlows = async (userId) => {
  return await automationCache.preloadUserFlows(userId);
};

export default {
  getAutomationFlows,
  getAutomationFlow,
  createAutomationFlow,
  updateAutomationFlow,
  deleteAutomationFlow,
  toggleAutomationFlow,
  testAutomationFlow,
  getAutomationExecutions,
  getAutomationExecution,
  getAutomationStatistics,
  getAvailableNodeTypes,
  preloadUserFlows
};
